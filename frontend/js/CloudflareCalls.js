import SmartContractConnector from './smartContractIntegration.js';
import "https://cdn.jsdelivr.net/npm/web3@1.6.1/dist/web3.min.js";

/**
 * CloudflareCalls.js
 *
 * High-level library for Cloudflare Calls using SFU,
 * now leveraging WebSocket for data message publish/subscribe flow.
 */

/**
 * Represents the CloudflareCalls library for managing real-time communications.
 */
class CloudflareCalls {
    /**
     * @typedef {Object} VideoQualitySettings
     * @property {Object} width - Video width settings
     * @property {number} width.ideal - Ideal video width in pixels
     * @property {Object} height - Video height settings
     * @property {number} height.ideal - Ideal video height in pixels
     * @property {Object} frameRate - Frame rate settings
     * @property {number} frameRate.ideal - Ideal frame rate in fps
     * @property {number} maxBitrate - Maximum video bitrate in bps
     */

    /**
     * @typedef {Object} AudioQualitySettings
     * @property {number} maxBitrate - Maximum audio bitrate in bps
     * @property {number} sampleRate - Audio sample rate in Hz
     * @property {number} channelCount - Number of audio channels (1=mono, 2=stereo)
     */

    /**
     * @typedef {Object} QualityPreset
     * @property {VideoQualitySettings} video - Video quality settings
     * @property {AudioQualitySettings} audio - Audio quality settings
     */

    /**
     * @typedef {Object} ConnectionStats
     * @property {Object} outbound - Outbound (sending) statistics
     * @property {number} outbound.bitrate - Current outbound bitrate in bits/s
     * @property {number} outbound.packetLoss - Percentage of packets lost
     * @property {string} outbound.qualityLimitation - Reason for quality limitations (if any)
     * @property {Object} inbound - Inbound (receiving) statistics per track
     * @property {number} inbound.bitrate - Current inbound bitrate in bits/s
     * @property {number} inbound.packetLoss - Percentage of packets lost
     * @property {number} inbound.jitter - Current jitter in seconds
     * @property {Object} connection - Overall connection statistics
     * @property {number} connection.roundTripTime - Current round trip time in seconds
     * @property {string} connection.state - Current connection state
     */

    /**
     * @typedef {Object} StreamStats
     * @property {string} sessionId - Session ID of the stream
     * @property {number} packetLoss - Packet loss percentage
     * @property {string} qualityLimitation - Quality limitation reason
     * @property {number} bitrate - Current bitrate
     */

    /**
     * Creates an instance of CloudflareCalls.
     * @param {Object} config - Configuration object.
     * @param {string} config.backendUrl - The backend server URL.
     * @param {string} config.websocketUrl - The WebSocket server URL.
     */
    constructor(config = {}) {
        this.backendUrl = config.backendUrl || '';
        this.websocketUrl = config.websocketUrl || '';
        this.debug = config.debug || false;

        this.token = null;
        this.roomId = null;
        this.sessionId = "";
        this.userId = this._generateUUID();

        this.userMetadata = {};

        this.localStream = null;
        this.peerConnection = null;
        this.ws = null;

        // Specific message handlers
        this._onParticipantJoinedCallback = null;
        this._onParticipantLeftCallback = null;
        this._onRemoteTrackCallback = null;
        this._onRemoteTrackUnpublishedCallback = null;
        this._onTrackStatusChangedCallback = null;
        this._onDataMessageCallback = null;
        this._onConnectionStatsCallback = null;
        this._onBackendEventCallback = null;

        // Generic message handlers
        this._wsMessageHandlers = new Set();

        // Track management
        this.pulledTracks = new Map(); // Map<sessionId, Set<trackName>>
        this.pollingInterval = null; // Reference to the polling interval

        // Device management
        this.availableAudioInputDevices = [];
        this.availableVideoInputDevices = [];
        this.availableAudioOutputDevices = [];
        this.currentAudioOutputDeviceId = null;

        this._renegotiateTimeout = null;
        this.publishedTracks = new Set();

        this.midToSessionId = new Map();
        this.midToTrackName = new Map();

        this._onRoomMetadataUpdatedCallback = null;

        // Store initial quality settings
        /** @type {QualityPreset} */
        this.pendingQualitySettings = null;

        this.mediaQuality = CloudflareCalls.QUALITY_PRESETS.medium_16x9_md;

        /** @type {Object.<string, QualityPreset>} */
        this.QUALITY_PRESETS = CloudflareCalls.QUALITY_PRESETS;

        // Stats monitoring
        this.statsInterval = null;
        this.previousStats = null;

        /** @type {'stopped'|'monitoring'} */
        this.statsMonitoringState = 'stopped';

        this.pullTrackQueue = [];
        this.isProcessingPullTrack = false;

        this.pullTrackWait = false;

        this.isRenegotiating = false;

    }

    /**
     * Internal logging method that only outputs when debug is enabled
     * @private
     * @param {...any} args - Arguments to pass to console.log
     */
    _log(...args) {
        if (this.debug) {
            console.log('[CloudflareCalls]', ...args);
        }
    }

    /**
     * Internal warning method that only outputs when debug is enabled
     * @private
     * @param {...any} args - Arguments to pass to console.warn
     */
    _warn(...args) {
        if (this.debug) {
            console.warn('[CloudflareCalls]', ...args);
        }
    }

    /**
     * Internal error method that always outputs (important for debugging)
     * @private
     * @param {...any} args - Arguments to pass to console.error
     */
    _error(...args) {
        console.error('[CloudflareCalls]', ...args);
    }

    /**
     * Enable or disable debug logging
     * @param {boolean} enabled - Whether to enable debug logging
     */
    setDebugMode(enabled) {
        this.debug = Boolean(enabled);
    }

    /**
     * Internal method to perform fetch requests with automatic token inclusion and JSON parsing.
     * @private
     * @param {string} url - The full URL to fetch.
     * @param {Object} options - Fetch options such as method, headers, body, etc.
     * @returns {Promise<Object>} The parsed JSON response.
     * @throws {Error} If the response is not OK.
     */
    async _fetch(url, options = {}) {
        // Initialize headers if not provided
        options.headers = options.headers || {};

        // Add Authorization header if token is set
        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, options);

            // Check if the response status is OK (status in the range 200-299)
            if (!response.ok) {
                this._warn(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            this._warn(`Fetch error for ${url}:`, error);
            return false;
        }
    }


    /************************************************
     * Callback Registration
     ***********************************************/

    /**
     * Registers a callback for remote track events.
     * @param {Function} callback - The callback function to handle remote tracks.
     */
    onRemoteTrack(callback) {
        this._onRemoteTrackCallback = callback;
    }

    /**
     * Registers a callback for remote track unpublished events.
     * @param {Function} callback - The callback function to handle track unpublished events.
     */
    onRemoteTrackUnpublished(callback) {
        this._onRemoteTrackUnpublishedCallback = callback;
    }

    /**
     * Registers a callback for incoming data messages.
     * @param {Function} callback - The callback function to handle data messages.
     */
    onDataMessage(callback) {
        this._onDataMessageCallback = callback;
    }

    /**
     * Registers a callback for participant joined events.
     * @param {Function} callback - The callback function to handle participant joins.
     */
    onParticipantJoined(callback) {
        this._onParticipantJoinedCallback = callback;
    }

    /**
     * Registers a callback for participant left events.
     * @param {Function} callback - The callback function to handle participant departures.
     */
    onParticipantLeft(callback) {
        this._onParticipantLeftCallback = callback;
    }

    /**
     * Registers a callback for track status changed events.
     * @param {Function} callback - The callback function to handle track status changes.
     */
    onTrackStatusChanged(callback) {
        this._onTrackStatusChangedCallback = callback;
    }

    /**
     * Registers a callback for WebSocket messages
     * @param {Function} callback - Function to call when WebSocket messages are received
     * @returns {Function} Function to unregister the callback
     */
    onWebSocketMessage(callback) {
        this._wsMessageHandlers.add(callback);
        return () => this._wsMessageHandlers.delete(callback);
    }

    /**
     * Register a callback for events coming from the backend via smart contract
     * @param {Function} callback - The callback function to handle backend events
     */
    onBackendEvent(callback) {
        this._onBackendEventCallback = callback;
    }

    /**
     * Start listening for SDP answers from the backend via smart contract
     * This is crucial for establishing WebRTC connections successfully
     */
    listenForBackendEvents() {
        if (!this.roomId) {
            this._warn('Cannot listen for backend events before joining a room');
            return;
        }

        if (!SmartContractConnector.isInitialized) {
            this._warn('SmartContractConnector not initialized');
            return;
        }

        console.log('Starting to listen for events forwarded from backend to frontend');
        
        // Lắng nghe các sự kiện từ backend thông qua phương thức mới
        SmartContractConnector.listenForEventsToFrontend(
            this.roomId,
            async (eventData) => {
                try {
                    console.log('Received event from backend via smart contract:', eventData);
                    
                    // Nếu đây là SDP answer cho offer của chúng ta, xử lý
                    if (eventData && eventData.type === 'answer' && eventData.sdp) {
                        if (this.peerConnection && this.peerConnection.signalingState === 'have-local-offer') {
                            const sessionDescription = new RTCSessionDescription({
                                type: 'answer',
                                sdp: eventData.sdp
                            });
                            
                            await this.peerConnection.setRemoteDescription(sessionDescription);
                            console.log('Applied SDP answer received via smart contract event');
                        } else if (this.peerConnection) {
                            console.warn(`Invalid signaling state for setRemoteDescription: ${this.peerConnection.signalingState}`);
                        }
                    }
                    
                    // Nếu có callback đăng ký, chuyển sự kiện đến nó
                    if (this._onBackendEventCallback) {
                        // Thực thi callback trong Promise để không block luồng chính
                        Promise.resolve().then(() => {
                            this._onBackendEventCallback(eventData);
                        });
                    }
                } catch (error) {
                    this._error('Error processing backend event:', error);
                }
            }
        );
    }

    /************************************************
     * User Metadata Management
     ***********************************************/

    /**
     * Sets the user token for server requests. This should be a JWT token, and will be delivered in Authorization headers (HTTP) and to authenticate websocket join requests.
     * @param {String} token - The metadata to associate with the user.
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Register callback for room metadata updates
     * @param {Function} callback Callback function
     */
    onRoomMetadataUpdated(callback) {
        this._onRoomMetadataUpdatedCallback = callback;
    }

    /**
     * Sets the user metadata and updates it on the server.
     * @param {Object} metadata - The metadata to associate with the user.
     */
    setUserMetadata(metadata) {
        this.userMetadata = metadata;
        this._updateUserMetadataOnServer();
    }

    /**
     * Retrieves the current user metadata.
     * @returns {Object} The user metadata.
     */
    getUserMetadata() {
        return this.userMetadata;
    }

    /**
     * Updates user metadata on the server
     * @private
     * @async
     * @returns {Promise<void>}
     */
    async _updateUserMetadataOnServer() {
        if (!this.roomId || !this.sessionId) {
            this._warn('Cannot update metadata before joining a room.');
            return;
        }

        // try {
        //     const updateUrl = `${this.backendUrl}/api/rooms/${this.roomId}/metadata`;
        //     const response = await this._fetch(updateUrl, {
        //         method: 'PUT',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify(this.userMetadata)
        //     });

        //     if (!response.ok) {
        //         this._error('Failed to update user metadata on server.');
        //     } else {
        //         console.log('User metadata updated on server.');
        //     }
        // } catch (error) {
        //     this._error('Error updating user metadata:', error);
        //     throw error;
        // }
    }

    /************************************************
     * Room & Session Management
     ***********************************************/

    /**
     * Creates a new room with optional metadata.
     * @async
     * @param {Object} options Room creation options
     * @param {string} [options.name] Room name
     * @param {Object} [options.metadata] Room metadata
     * @returns {Promise<Object>} Created room information including roomId, name, metadata, etc.
     */
    async createRoom(options = {}) {
        // const resp = await this._fetch(`${this.backendUrl}/api/rooms`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(options)
        // }).then(r => r.json());
        const roomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const resp = { roomId, name: options.name, metadata: options.metadata };
        console.log('Create Room Response:', resp);
        // Store the roomId
        this.roomId = resp.roomId;

        // Return the full room object
        return resp;
    }

    /**
     * Joins an existing room.
     * @async
     * @param {string} roomId - The ID of the room to join.
     * @param {Object} [metadata={}] - Optional metadata for the user.
     * @returns {Promise<void>}
     */
    async joinRoom(roomId, metadata = {}) {
        this.roomId = roomId;

        try {
            // Create RTCPeerConnection
            this.peerConnection = await this._createPeerConnection();

            // Get Local Media and Publish Tracks
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                console.log('Acquired local media');
            }

            // Wait for SmartContractConnector to be initialized, retrying if necessary
            let retries = 0;
            while (!SmartContractConnector.isInitialized && retries < 3) {
                console.log(`Attempt ${retries + 1} to initialize SmartContractConnector...`);
                await SmartContractConnector.initialize();
                if (!SmartContractConnector.isInitialized) {
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
                }
            }

            if (!SmartContractConnector.isInitialized) {
                throw new Error("Failed to initialize SmartContractConnector after multiple attempts");
            }
            
            // Start the call through smart contract
            await SmartContractConnector.startCallSM(this.roomId);
            console.log('Smart contract call started for room', this.roomId);

            // // Join room and publish tracks
            // const [joinResp, publishResult] = await Promise.all([
            //     SmartContractConnector.joinRoom(roomId, metadata.name || 'User', [], {}),
            //     this._publishTracks()
            // ]);

            // if (joinResp && joinResp.sessionID) {
            //     this.sessionId = joinResp.sessionID;
            // } else {
            //     this.sessionId = this._generateUUID(); // Fallback
            // }
            
            const publishResult = await this._publishTracks();

            console.log('Joined room', roomId, 'with session:', this.sessionId);

            // Store the sessionId in localStorage for easy access across pages
            localStorage.setItem('sessionId', this.sessionId);

            // Set user metadata
            this.setUserMetadata(metadata);

            return {
                roomId: this.roomId,
                sessionId: this.sessionId
            };
        } catch (error) {
            this._error('Error joining room:', error);
            throw error;
        }
    }

    /**
     * Cleans up ended tracks in localStream
     * @async
     * @private
     * @returns {void}
     */
    async _cleanupEndedTracks() {
        // Clear local media devices (readyState == 'ended', so they can't be reused)
        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                if (track.readyState === 'ended') {
                    this.localStream.removeTrack(track);
                    track.stop();
                }
            }
        }

        // If no tracks remain, clear the stream
        if (this.localStream && !this.localStream.getTracks().length) {
            this.localStream = null;
        }
    }

    /**
     * Leaves the current room and cleans up connections.
     * @async
     * @returns {Promise<void>}
     */
    async leaveRoom() {
        if (!this.roomId || !this.sessionId) return;

        // Clean up published tracks (if applicable)
        const senders = this.peerConnection ? this.peerConnection.getSenders() : [];
        if (senders && senders.length) {
            await this.unpublishAllTracks();
        }

        try {
            console.log('Leaving room via smart contract...');
            // Wait for smart contract to process
            let result;
            try {
                result = await SmartContractConnector.leaveRoomHandle(this.roomId, this.sessionId);
                console.log('Successfully left room via smart contract:', result);
            } catch (contractError) {
                console.error('Error from smart contract when leaving room:', contractError);
                // Continue with cleanup even if contract fails
            }

            // Clean up WebSocket connection
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }

            // Clean up PeerConnection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            await this._cleanupEndedTracks();

            console.log('Left room, closed PC & WS');

            // Reset room state
            this.roomId = null;
            this.sessionId = null;
            this.pulledTracks.clear();
            this.midToSessionId.clear();
            this.midToTrackName.clear();
            this.publishedTracks.clear();
        } catch (error) {
            console.error('Error leaving room:', error);
            throw error;
        }
    }

    /**
     * Publishes the local media tracks to the room.
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If there is no local media stream to publish.
     */
    async publishTracks() {
        if (!this.localStream) {
            return this._warn('No local media stream to publish.');
        }
        await this._publishTracks();
    }

    /**
     * Publishes the local media tracks to the PeerConnection and server.
     * @async
     * @private
     * @returns {Promise<void>}
     */
    async _publishTracks() {
        console.log('Publishing tracks...');
        if (!this.localStream || !this.peerConnection){
            console.log('No local media stream or peer connection to publish');
            return;
        } 

        const transceivers = [];
        for (const track of this.localStream.getTracks()) {
            // Check if we've already published this track
            if (this.publishedTracks.has(track.id)) continue;
            if (track.readyState !== 'live') continue;

            const tx = this.peerConnection.addTransceiver(track, { direction: 'sendonly' });

            // Apply any pending quality settings to video tracks
            if (this.pendingQualitySettings && track.kind === 'video') {
                const params = tx.sender.getParameters();
                params.encodings = [{
                    maxBitrate: this.pendingQualitySettings.video.maxBitrate
                }];
                tx.sender.setParameters(params);
            }

            transceivers.push(tx);
            this.publishedTracks.add(track.id);
        }

        if (transceivers.length === 0) return;  // No new tracks to publish

        const offer = await this.peerConnection.createOffer();
        console.log('[CloudflareCalls] SDP Offer:', offer.sdp);
        await this.peerConnection.setLocalDescription(offer);

        const trackInfos = transceivers.map(({ sender, mid }) => ({
            location: 'local',
            mid,
            trackName: sender.track.id
        }));

        // Create the track data object
        const trackData = {
            offer: { sdp: offer.sdp, type: offer.type },
            tracks: trackInfos,
            metadata: this.userMetadata
        };

        try {
            // Send via smart contract
            console.log('[CloudflareCalls] Publishing tracks via smart contract');

            // Set up listener for the answer event
            const removeListenerPublish = await SmartContractConnector.listenForTrackPublishedAnswer(
                this.roomId,
                async (answerData) => {
                    try {
                        console.log('Received answer from backend via smart contract event:', answerData);

                        if (answerData && answerData.sessionDescription) {
                            if (this.peerConnection && this.peerConnection.signalingState === 'have-local-offer') {
                                await this.peerConnection.setRemoteDescription(answerData.sessionDescription);
                                console.log('Applied SFU answer received via smart contract');
                            } else if (this.peerConnection) {
                                console.warn(`Invalid signaling state for setRemoteDescription: ${this.peerConnection.signalingState}`);
                            }
                        } else {
                            console.log('Invalid or missing answer data from smart contract event');
                        }
                    } catch (error) {
                        console.error('Error handling answerData:', error);
                    } finally {
                        // Always remove listener to prevent memory leaks
                        if (typeof removeListenerPublish === 'function') {
                            removeListenerPublish();
                        }
                    }
                }
            );

            // Call the smart contract function
            await SmartContractConnector.publishTracksCompressed(this.roomId, trackData, this.sessionId);
            console.log('Track data sent to smart contract successfully');
        } catch (error) {
            console.log('Failed to publish tracks via smart contract:', error);
            // Don't throw here - we want to allow graceful fallback or retries
        }
    }

    /**
     * Initiates renegotiation of the PeerConnection using smart contract.
     * @async
     * @private
     * @returns {Promise<void>}
     */
    async _renegotiate() {
        if (!this.peerConnection) {
            console.log('No peer connection available for renegotiation');
            return;
        }
        
        try {
            console.log('Creating renegotiation answer...');
            const answer = await this.peerConnection.createAnswer();
            
            if (this.peerConnection.signalingState === 'have-remote-offer') {
                console.log('Setting local description for renegotiation');
                await this.peerConnection.setLocalDescription(answer);
                
                // Set up listener for renegotiation response
                const removeListener = SmartContractConnector.ListenToAnswerRenegotiate(
                    this.sessionId,
                    async (answerData) => {
                        try {
                            console.log('Received renegotiation response:', answerData);
                            if (answerData.sessionDescription) {
                                const remoteDesc = new RTCSessionDescription(answerData.sessionDescription);
                                await this.peerConnection.setRemoteDescription(remoteDesc);
                                console.log('Renegotiation completed successfully');
                            }
                        } catch (error) {
                            console.error('Error handling renegotiation response:', error);
                        } finally {
                            if (removeListener) removeListener();
                        }
                    }
                );

                // Send renegotiation request to smart contract
                await SmartContractConnector.callToRenegotiate(
                    this.sessionId,
                    answer.sdp,
                    answer.type
                );

                console.log('Renegotiation request sent to smart contract');
            } else {
                console.log('Peer connection not in correct state for renegotiation');
            }
        } catch (error) {
            console.error('Renegotiation error:', error); 
        }
    }

    /**
     * Updates the published media tracks.
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If the PeerConnection is not established.
     */

    async updatePublishedTracks() {
        if (!this.peerConnection) {
            return this._warn('PeerConnection is not established.');
        }

        // Remove existing senders
        const senders = this.peerConnection.getSenders();
        for (const sender of senders) {
            this.peerConnection.removeTrack(sender);
        }

        // Add updated tracks
        await this._publishTracks();
    }

    /**
     * Pulls a specific track from a remote session.
     * @async
     * @private
     * @param {string} remoteSessionId - The session ID of the remote participant.
     * @param {string} trackName - The name of the track to pull.
     * @returns {Promise<void>}
     */
    async _pullTracks(remoteSessionId, trackName) {
        if (!this.peerConnection) {
            throw new Error('PeerConnection not established');
        }

        // Wait for peer connection to be fully established
        if (this.peerConnection.connectionState !== 'connected') {
            console.log('Waiting for peer connection to be established...');
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for peer connection'));
                }, 10000); // 10 second timeout

                const checkState = () => {
                    if (this.peerConnection.connectionState === 'connected') {
                        clearTimeout(timeout);
                        resolve();
                    } else if (this.peerConnection.connectionState === 'failed') {
                        clearTimeout(timeout);
                        reject(new Error('Peer connection failed'));
                    } else {
                        setTimeout(checkState, 100);
                    }
                };
                checkState();
            });
        }

        // Add to pull track queue
        return new Promise((resolve, reject) => {
            console.log(`Queueing track pull: '${trackName}' from session ${remoteSessionId}`);

            // Add to queue
            this.pullTrackQueue.push({
                remoteSessionId,
                trackName,
                resolve,
                reject
            });

            // Start processing if not already in progress
            if (!this.isProcessingPullTrack) {
                this._processPullTrackQueue();
            }
        });
    }

    // Inside _processPullTrackQueue method
    async _processPullTrackQueue() {
        if (this.pullTrackQueue.length === 0) {
            this.isProcessingPullTrack = false;
            return;
        }

        this.isProcessingPullTrack = true;
        const { remoteSessionId, trackName, resolve, reject } = this.pullTrackQueue.shift();

        if (!this.peerConnection || this.peerConnection.connectionState !== 'connected') {
            reject(new Error('PeerConnection not ready'));
            this._processPullTrackQueue();
            return;
        }

        try {
            console.log(`Processing pull track from queue: '${trackName}' from session ${remoteSessionId}`);

            // Set up listener for pull answer from the smart contract
            const removeListener = SmartContractConnector.listenForEventsToFrontend(
                this.roomId,
                async (pullAnswerData) => {
                    try {
                        console.log('Received pull answer from backend:', pullAnswerData);

                        // if (pullAnswerData.errorCode) {
                        //     const error = new Error(pullAnswerData.errorDescription || 'Pull track failed');
                        //     this._error('Pull track error:', error);
                        //     reject(error);
                        //     return;
                        // }

                        if (pullAnswerData.requiresImmediateRenegotiation) {
                            if (this.isRenegotiating) {
                                console.log('Already renegotiating, waiting...');
                                return;
                            }

                            this.isRenegotiating = true;

                            try {
                                // Set up mappings from the SDP
                                const pendingMids = new Set();
                                pullAnswerData.sessionDescription.sdp.split('\n').forEach(line => {
                                    if (line.startsWith('a=mid:')) {
                                        const mid = line.split(':')[1].trim();
                                        pendingMids.add(mid);
                                        this.midToSessionId.set(mid, remoteSessionId);
                                        this.midToTrackName.set(mid, trackName);
                                        console.log('Pre-mapped MID:', { mid, sessionId: remoteSessionId, trackName });
                                    }
                                });

                                // Now set the remote description and create answer
                                await this.peerConnection.setRemoteDescription(pullAnswerData.sessionDescription);

                                // Create and set local answer only if we're in the right state
                                if (this.peerConnection.signalingState === 'have-remote-offer') {
                                    const localAnswer = await this.peerConnection.createAnswer();
                                    console.log('Setting local description for renegotiation');
                                    await this.peerConnection.setLocalDescription(localAnswer);

                                    // Set up listener for renegotiation answer
                                    const removeRenegotiationListener = SmartContractConnector.ListenToAnswerRenegotiate(
                                        this.sessionId,
                                        async (renegotiationAnswer) => {
                                            try {
                                                console.log('Received renegotiation answer:', renegotiationAnswer);
                                                if (renegotiationAnswer.sessionDescription) {
                                                    await this.peerConnection.setRemoteDescription(renegotiationAnswer.sessionDescription);
                                                    console.log('Successfully completed renegotiation');
                                                }
                                            } catch (error) {
                                                this._error('Error handling renegotiation answer:', error);
                                            } finally {
                                                if (typeof removeRenegotiationListener === 'function') {
                                                    removeRenegotiationListener();
                                                }
                                            }
                                        }
                                    );

                                    // Send renegotiation request
                                    await SmartContractConnector.callToRenegotiate(
                                        this.sessionId,
                                        localAnswer.sdp,
                                        localAnswer.type
                                    );
                                } else {
                                    console.log(`Skipping local answer due to signaling state: ${this.peerConnection.signalingState}`);
                                }

                                // Verify mid mappings
                                this.peerConnection.getTransceivers().forEach(transceiver => {
                                    if (transceiver.mid && pendingMids.has(transceiver.mid)) {
                                        this._log('Verified MID mapping:', {
                                            mid: transceiver.mid,
                                            sessionId: remoteSessionId,
                                            direction: transceiver.direction
                                        });
                                    }
                                });

                            } finally {
                                this.isRenegotiating = false;
                            }
                        }

                        // Record the pulled track
                        if (!this.pulledTracks.has(remoteSessionId)) {
                            this.pulledTracks.set(remoteSessionId, new Set());
                        }
                        this.pulledTracks.get(remoteSessionId).add(trackName);

                        console.log(`Successfully pulled trackName="${trackName}" from session ${remoteSessionId}`);
                        resolve();
                    } catch (error) {
                        this._error('Error processing pull track answer:', error);
                        reject(error);
                    } finally {
                        if (typeof removeListener === 'function') {
                            removeListener();
                        }
                        this._processPullTrackQueue();
                    }
                }
            );

            // Send pull track request via smart contract
            await SmartContractConnector.pullTracksCompressed(
                this.roomId,
                this.sessionId,
                remoteSessionId,
                trackName
            );

        } catch (error) {
            this._error('Error in pull track processing:', error);
            reject(error);
            this._processPullTrackQueue();
        }
    }

    /************************************************
     * PeerConnection & WebSocket
     ***********************************************/

    /**
     * Creates and configures a new RTCPeerConnection.
     * @async
     * @private
     * @returns {Promise<RTCPeerConnection>} The configured RTCPeerConnection instance.
     */
    async _attemptIceServersUpdate() {
        // Hardcoded Cloudflare TURN credentials
        const username = "dda98a91e2f72c85a3a6488078e09a5b";
        const credential = "0b18957941ea8168540d604cea932da5c03b214aac6dcb992a195523cf9fbf83";

        // Hardcoded ICE server configuration
        const iceServers = [
            { urls: "stun:stun.cloudflare.com:3478" },
            {
                urls: "turn:turn.cloudflare.com:3478?transport=udp",
                username: username,
                credential: credential,
            },
            {
                urls: "turn:turn.cloudflare.com:3478?transport=tcp",
                username: username,
                credential: credential,
            },
            {
                urls: "turns:turn.cloudflare.com:5349?transport=tcp",
                username: username,
                credential: credential,
            },
        ];

        console.log('Using hardcoded ICE servers:', iceServers);
        return iceServers;
    }
    async _createPeerConnection() {
        let iceServers = await this._attemptIceServersUpdate() || [{ urls: 'stun:stun.cloudflare.com:3478' }];

        const pc = new RTCPeerConnection({
            iceServers: iceServers,
            bundlePolicy: 'max-bundle',
            sdpSemantics: 'unified-plan'
        });

        pc.onicecandidate = (evt) => {
            if (evt.candidate) {
                console.log('New ICE candidate:', evt.candidate.candidate);
            } else {
                console.log('All ICE candidates have been sent');
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
            // if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            //     this.leaveRoom();
            // }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection State:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                console.log('Peer connection fully established');
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                console.log('Peer connection disconnected or failed');
                this.leaveRoom();
            }
        };

        pc.ontrack = (evt) => {
            console.log('ontrack event:', {
                kind: evt.track.kind,
                webrtcTrackId: evt.track.id,
                mid: evt.transceiver?.mid
            });

            if (this._onRemoteTrackCallback) {
                const mid = evt.transceiver?.mid;
                const sessionId = this.midToSessionId.get(mid);
                const trackName = this.midToTrackName.get(mid);

                console.log('Track mapping lookup:', {
                    mid,
                    sessionId,
                    trackName,
                    webrtcTrackId: evt.track.id,
                    availableMappings: {
                        sessions: Array.from(this.midToSessionId.entries()),
                        tracks: Array.from(this.midToTrackName.entries())
                    }
                });

                if (!sessionId) {
                    this._warn('No sessionId found for mid:', mid);
                    if (!this.pendingTracks) this.pendingTracks = [];
                    this.pendingTracks.push({ evt, mid });
                    return;
                }

                const wrappedTrack = evt.track;
                wrappedTrack.sessionId = sessionId;
                wrappedTrack.mid = mid;
                wrappedTrack.trackName = trackName;

                console.log('Sending track to callback:', {
                    webrtcTrackId: wrappedTrack.id,
                    trackName: wrappedTrack.trackName,
                    sessionId: wrappedTrack.sessionId,
                    mid: wrappedTrack.mid
                });

                this._onRemoteTrackCallback(wrappedTrack);
            }
        };

        return pc;
    }




    /************************************************
     * Polling for New Tracks
     ***********************************************/

    /**
     * Starts polling the server for new tracks every 10 seconds.
     * @private
     * @returns {void}
     */
    _startPolling() {
        this.pollingInterval = setInterval(async () => {
            if (!this.roomId) return;

            try {
                const resp = await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/participants`)
                    .then(r => r.json());
                const participants = resp.participants || [];

                for (const participant of participants) {
                    const { sessionId, publishedTracks } = participant;
                    if (sessionId === this.sessionId) continue; // Skip self

                    if (!this.pulledTracks.has(sessionId)) {
                        this.pulledTracks.set(sessionId, new Set());
                    }

                    for (const trackName of publishedTracks) {
                        if (!this.pulledTracks.get(sessionId).has(trackName)) {
                            console.log(`[Polling] New track detected: ${trackName} from session ${sessionId}`);
                            await this._pullTracks(sessionId, trackName);
                        }
                    }
                }
            } catch (err) {
                this._error('Polling error:', err);
            }
        }, 10000);
    }

    /************************************************
     * Device Management
     ***********************************************/

    /**
     * Retrieves the list of available media devices.
     * @async
     * @returns {Promise<Object>} An object containing arrays of audio input, video input, and audio output devices.
     */
    async getAvailableDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.availableAudioInputDevices = devices.filter(device => device.kind === 'audioinput');
        this.availableVideoInputDevices = devices.filter(device => device.kind === 'videoinput');
        this.availableAudioOutputDevices = devices.filter(device => device.kind === 'audiooutput');

        return {
            audioInput: this.availableAudioInputDevices,
            videoInput: this.availableVideoInputDevices,
            audioOutput: this.availableAudioOutputDevices
        };
    }

    /**
     * Selects a specific audio input device.
     * @async
     * @param {string} deviceId - The ID of the audio input device to select.
     * @returns {Promise<void>}
     */
    async selectAudioInputDevice(deviceId) {
        if (!deviceId) {
            this._warn('No deviceId provided for audio input.');
            return;
        }

        const constraints = {
            audio: { deviceId: { exact: deviceId } },
            video: false
        };

        try {
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newAudioTrack = newStream.getAudioTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => s.track.kind === 'audio');
            if (sender) {
                sender.replaceTrack(newAudioTrack);
                const oldTrack = sender.track;
                oldTrack.stop();
            } else {
                this.localStream.addTrack(newAudioTrack);
                await this._publishTracks();
            }

            console.log(`Switched to audio input device: ${deviceId}`);
        } catch (error) {
            this._error('Error switching audio input device:', error);
        }
    }

    /**
     * Selects a specific video input device.
     * @async
     * @param {string} deviceId - The ID of the video input device to select.
     * @returns {Promise<void>}
     */
    async selectVideoInputDevice(deviceId) {
        if (!deviceId) {
            this._warn('No deviceId provided for video input.');
            return;
        }

        const constraints = {
            video: { deviceId: { exact: deviceId } },
            audio: false
        };

        try {
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(newVideoTrack);
                const oldTrack = sender.track;
                oldTrack.stop();
            } else {
                this.localStream.addTrack(newVideoTrack);
                await this._publishTracks();
            }

            console.log(`Switched to video input device: ${deviceId}`);
        } catch (error) {
            this._error('Error switching video input device:', error);
        }
    }

    /**
     * Selects a specific audio output device.
     * @async
     * @param {string} deviceId - The ID of the audio output device to select.
     * @returns {Promise<void>}
     */
    async selectAudioOutputDevice(deviceId) {
        if (!deviceId) {
            this._warn('No deviceId provided for audio output.');
            return;
        }

        try {
            const audioElements = document.querySelectorAll('audio');
            for (const audio of audioElements) {
                await audio.setSinkId(deviceId);
            }
            this.currentAudioOutputDeviceId = deviceId;
            console.log(`Switched to audio output device: ${deviceId}`);
        } catch (error) {
            this._error('Error switching audio output device:', error);
        }
    }

    /**
     * Previews media streams with specified device IDs.
     * @async
     * @param {Object} params - Parameters for media preview.
     * @param {string} [params.audioDeviceId] - The ID of the audio input device to use.
     * @param {string} [params.videoDeviceId] - The ID of the video input device to use.
     * @param {HTMLMediaElement} [previewElement=null] - The media element to display the preview.
     * @returns {Promise<MediaStream>} The media stream being previewed.
     * @throws {Error} If there is an issue accessing the media devices.
     */
    async previewMedia({ audioDeviceId, videoDeviceId }, previewElement = null) {
        const constraints = {
            audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
            video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : false
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (previewElement) {
                previewElement.srcObject = stream;
            }
            return stream;
        } catch (error) {
            this._error('Error previewing media:', error);
            throw error;
        }
    }

    /************************************************
     * Media Controls
     ***********************************************/

    /**
     * Toggles the enabled state of video and/or audio tracks.
     * @param {Object} options - Options to toggle media tracks.
     * @param {boolean} [options.video=null] - Whether to toggle video tracks.
     * @param {boolean} [options.audio=null] - Whether to toggle audio tracks.
     * @returns {void}
     */
    toggleMedia({ video = null, audio = null }) {
        if (!this.localStream) return;

        if (video !== null) {
            const videoTracks = this.localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = video;
                // Find the corresponding sender and update the track status
                const sender = this.peerConnection?.getSenders().find(s => s.track === track);
                if (sender) {
                    // Send track status update to SFU
                    this._updateTrackStatus(sender.track.id, 'video', video);
                }
            });
        }

        if (audio !== null) {
            const audioTracks = this.localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = audio;
                // Find the corresponding sender and update the track status
                const sender = this.peerConnection?.getSenders().find(s => s.track === track);
                if (sender) {
                    // Send track status update to SFU
                    this._updateTrackStatus(sender.track.id, 'audio', audio);
                }
            });
        }
    }

    /**
     * Starts screen sharing.
     * @async
     * @returns {Promise<void>}
     */
    async shareScreen() {
        try {
            // // Stop any existing video tracks (Todo: breaks the addTrack)
            // await this.unpublishAllTracks('video');

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false  // Most browsers don't support screen audio yet
            });

            const screenTrack = screenStream.getVideoTracks()[0];

            // Add the new screen track
            this.localStream.addTrack(screenTrack);

            // Publish the new track
            await this._publishTracks();

            // Handle the user stopping screen share
            screenTrack.onended = async () => {
                const container = document.getElementById(`Participant ${sessionId}`);
                if (container) {
                    container.remove();
                    console.log(`Removed video container for participant with sessionId ${sessionId}`);
                }
            };
        } catch (err) {
            this._error('Error sharing screen:', err);
            throw err;
        }
    }

    /************************************************
     * WebSocket-Based Data Communication
     ***********************************************/

    /**
     * Internal method to send a message via WebSocket.
     * @private
     * @param {Object} data - The data object to send.
     * @returns {void}
     */
    _sendWebSocketMessage(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this._warn('WebSocket is not open. Cannot send message.');
            return;
        }
        this.ws.send(JSON.stringify(data));
        console.log('Sent WebSocket message:', data);
    }

    /************************************************
     * Participant Management
     ***********************************************/

    /**
     * Lists all participants currently in the room.
     * @async
     * @returns {Promise<Array<Object>>} An array of participant objects.
     * @throws {Error} If not connected to any room.
     */
    async listParticipants() {
        if (!this.roomId) {
            return this._warn('Not connected to any room.');
        }

        // const resp = await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/participants`)
        //     .then(r => r.json());

        return resp.participants || [];
    }

    /************************************************
     * Helpers & Placeholders
     ***********************************************/

    /**
     * Generates a simple UUID.
     * @private
     * @returns {string} A generated UUID string.
     */
    _generateUUID() {
        // Simple placeholder generator
        return 'xxxx-xxxx-xxxx-xxxx'.replace(/[x]/g, () =>
            ((Math.random() * 16) | 0).toString(16)
        );
    }

    /**
     * Unpublishes all currently published tracks (with filters for type)
     * @async
     * @param {string} trackKind - The kind of track to unpublish ('audio' or 'video').
     * @param {boolean} [force=false] - If true, forces track closure without renegotiation.
     * @returns {Promise<void>}
     */
    async unpublishAllTracks(trackKind, force = false) {
        if (!this.peerConnection) {
            this._warn('PeerConnection is not established.');
            return;
        }

        // let senders = this.peerConnection.getSenders();
        // if (trackKind) {
        //     senders = senders.filter(s => s.track && s.track.kind === trackKind);
        // }
        // console.log('Unpublishing all tracks:', senders.length);

        // // Create an offer for the updated state
        // const offer = await this.peerConnection.createOffer();
        // await this.peerConnection.setLocalDescription(offer);

        // for (const sender of senders) {
        //     if (sender.track) {
        //         try {
        //             const trackId = sender.track.id;
        //             const transceiver = this.peerConnection.getTransceivers().find(t => t.sender === sender);
        //             const mid = transceiver ? transceiver.mid : null;

        //             console.log('Unpublishing track:', { trackId, mid });

        //             if (!mid) {
        //                 this._warn('No mid found for track:', trackId);
        //                 continue;
        //             }

        //             // Stop the track first
        //             sender.track.stop();

        //             // Notify server
        //             await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/unpublish`, {
        //                 method: 'POST',
        //                 headers: { 'Content-Type': 'application/json' },
        //                 body: JSON.stringify({
        //                     trackName: trackId,
        //                     mid: mid,
        //                     force,
        //                     sessionDescription: {
        //                         type: offer.type,
        //                         sdp: offer.sdp
        //                     }
        //                 })
        //             });

        //             // Remove from PeerConnection after server confirms
        //             this.peerConnection.removeTrack(sender);

        //             // Remove from our tracked set
        //             this.publishedTracks.delete(trackId);

        //             // Since we're unpublishing we need to stop local streams
        //             await this._cleanupEndedTracks();

        //             console.log(`Successfully unpublished track: ${trackId}`);
        //         } catch (error) {
        //             this._error(`Error unpublishing track:`, error);
        //         }
        //     }
        // }
    }

    /**
     * Gets the session state
     * @async
     * @returns {Promise<Object>} The session state
     */
    async getSessionState() {
        if (!this.sessionId) {
            return this._warn('No active session');
        }

        // try {
        //     const response = await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/state`);
        //     const state = await response.json();

        //     // Store track states internally
        //     if (state.tracks) {
        //         this.trackStates = new Map(
        //             state.tracks.map(track => [track.trackName, track.status])
        //         );
        //     }

        //     return state;
        // } catch (error) {
        //     this._error('Error getting session state:', error);
        //     throw error;
        // }
    }

    /**
     * Gets the track status
     * @async
     * @param {string} trackName - The track name
     * @returns {Promise<string>} The track status
     */
    async getTrackStatus(trackName) {
        const state = await this.getSessionState();
        return state.tracks.find(t => t.trackName === trackName)?.status;
    }

    /**
     * Updates the track status
     * @async
     * @private
     * @param {string} trackId - The track ID
     * @param {string} kind - The track kind
     * @param {boolean} enabled - Whether the track is enabled
     * @returns {Promise<Object>} The updated track status
     */
    async _updateTrackStatus(trackId, kind, enabled) {
        try {
            const updateUrl = `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/track-status`;
            const response = await this._fetch(updateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trackId,
                    kind,
                    enabled,
                    force: false // Allow proper renegotiation
                })
            });

            const result = await response.json();
            if (result.errorCode) {
                throw new Error(result.errorDescription || 'Unknown error updating track status');
            }

            // If renegotiation is needed, handle it
            if (result.requiresImmediateRenegotiation) {
                await this._renegotiate();
            }

            if (!result.errorCode) {
                this._updateTrackState(trackId, enabled ? 'enabled' : 'disabled');
            }

            return result;
        } catch (error) {
            this._error(`Error updating track status:`, error);
            throw error;
        }

    }

    /**
     * Handles errors
     * @private
     * @param {Object} response - The response object
     * @returns {Object} The response object
     */
    _handleError(response) {
        if (response.errorCode) {
            const error = new Error(response.errorDescription || 'Unknown error');
            error.code = response.errorCode;
            throw error;
        }
        return response;
    }

    /**
     * Gets information about a user
     * @async
     * @param {string} [userId] - Optional user ID. If omitted, returns current user's info
     * @returns {Promise<Object>} User information including moderator status
     */
    async getUserInfo(userId = null) {
        try {
            const response = await this._fetch(
                `${this.backendUrl}/api/users/${userId || 'me'}`
            );
            return await response.json();
        } catch (error) {
            this._error('Error getting user info:', error);
            throw error;
        }
    }

    /**
     * Handles WebSocket messages
     * @private
     * @param {MessageEvent} event - The WebSocket message event
     * @returns {void}
     */


    /**
     * Updates track state in internal tracking
     * @private
     * @param {string} trackName - The track name
     * @param {string} status - The new status
     */
    _updateTrackState(trackName, status) {
        if (!this.trackStates) {
            this.trackStates = new Map();
        }
        this.trackStates.set(trackName, status);
    }

    /**
     * Lists all available rooms.
     * @async
     * @returns {Promise<Array>} List of rooms
     */
    async listRooms() {
        const resp = await this._fetch(`${this.backendUrl}/api/rooms`)
            .then(r => r.json());
        return resp.rooms;
    }

    /**
     * Updates room metadata.
     * @async
     * @param {Object} updates Metadata updates
     * @param {string} [updates.name] New room name
     * @param {Object} [updates.metadata] New room metadata
     * @returns {Promise<Object>} Updated room information
     */
    async updateRoomMetadata(updates) {
        if (!this.roomId) {
            return this._warn('Not connected to any room');
        }

        return await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/metadata`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        }).then(r => r.json());
    }

    async getParticipantsFromContract(roomId) {
        try {
            if (!SmartContractConnector.isInitialized) {
                await SmartContractConnector.initialize();
            }
            return await SmartContractConnector.getParticipantsFromContract(roomId);
        } catch (error) {
            console.error('Error getting participants from contract:', error);
            return [];
        }
    }

    /**
     * Send a data message to all participants in the room via WebSocket.
     * @param {Object} data - The JSON object to send.
     * @returns {void}
     */
    async sendDataToAll(data) {
        if (!this.roomId || !this.sessionId) {
            throw new Error('Must be in a room to send data');
        }

        // Send via WebSocket instead of HTTP
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'data-message',
                payload: {
                    from: this.sessionId,
                    message: data
                }
            }));
            console.log(JSON.stringify({
                type: 'data-message',
                payload: {
                    from: this.sessionId,
                    message: data
                }
            }));
        } else {
            throw new Error('WebSocket connection not available');
        }
    }

    /**
     * Sets the media quality for audio and video tracks
     * @param {string|QualityPreset} quality - Either a preset name ('high', 'medium', 'low') or a custom quality object
     * @param {VideoQualitySettings} [quality.video] - Video quality settings
     * @param {AudioQualitySettings} [quality.audio] - Audio quality settings
     * @throws {Error} If preset name is invalid
     */
    setMediaQuality(quality) {
        // If quality is a string, use the preset
        if (typeof quality === 'string') {
            const preset = CloudflareCalls.QUALITY_PRESETS[quality];
            if (!preset) {
                return this._warn(`Unknown quality preset: ${quality}`);
            }
            this.mediaQuality = quality;
            quality = preset;
        }

        this.mediaQuality = {
            video: { ...this.mediaQuality.video, ...quality.video },
            audio: { ...this.mediaQuality.audio, ...quality.audio }
        };

        // Store settings to apply to future tracks
        this.pendingQualitySettings = this.mediaQuality;

        // If we're already in a call, update existing tracks
        if (this.peerConnection) {
            this._applyQualitySettings();
        }
    }

    /**
     * Applies quality settings to all tracks
     * @private
     */
    async _applyQualitySettings() {
        if (!this.peerConnection) return;

        const senders = this.peerConnection.getSenders();
        for (const sender of senders) {
            if (!sender.track) continue;

            const params = sender.getParameters();
            if (!params.encodings) {
                params.encodings = [{}];
            }

            const kind = sender.track.kind;
            const qualitySettings = this.mediaQuality[kind];

            // Update bitrate
            if (qualitySettings.maxBitrate) {
                params.encodings[0].maxBitrate = qualitySettings.maxBitrate;
            }

            // Update resolution/framerate for video
            if (kind === 'video') {
                const constraints = {
                    width: qualitySettings.width,
                    height: qualitySettings.height,
                    frameRate: qualitySettings.frameRate
                };
                await sender.track.applyConstraints(constraints);
            }

            await sender.setParameters(params);
        }
    }

    /**
     * Start monitoring connection statistics
     * @param {number} [interval=1000] - How often to gather stats in milliseconds
     */
    startStatsMonitoring(interval = 1000) {
        if (this.statsMonitoringState === 'monitoring') return;

        this.statsMonitoringState = 'monitoring';
        this.statsInterval = setInterval(async () => {
            if (!this.peerConnection) return;

            const stats = await this._gatherConnectionStats();
            const streamStats = await this._gatherStreamStats();

            if (this._onConnectionStatsCallback) {
                this._onConnectionStatsCallback(stats, streamStats);
            }
        }, interval);
    }

    /**
     * Stop monitoring connection statistics
     */
    stopStatsMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
            // +           this.previousStats = null;  // Clear previous stats
        }
        this.statsMonitoringState = 'stopped';
    }

    /**
     * Register a callback to receive connection statistics
     * @param {function(ConnectionStats): void} callback - Function to receive stats updates
     */
    onConnectionStats(callback) {
        this._onConnectionStatsCallback = callback;
    }

    /**
     * Gather current connection statistics
     * @private
     * @returns {Promise<ConnectionStats>} Current connection statistics
     */
    async _gatherConnectionStats() {
        if (!this.peerConnection) {
            return this._warn('No active connection');
        }

        const stats = await this.peerConnection.getStats();
        const result = {
            outbound: {
                bitrate: 0,
                packetLoss: 0,
                qualityLimitation: 'none'
            },
            inbound: {
                bitrate: 0,
                packetLoss: 0,
                jitter: 0
            },
            connection: {
                roundTripTime: 0,
                state: this.peerConnection.connectionState
            }
        };

        let outboundStats = null;
        let inboundStats = null;

        // Process each stat
        stats.forEach(stat => {
            switch (stat.type) {
                case 'outbound-rtp':
                    if (stat.kind === 'video') {
                        outboundStats = stat;
                        result.outbound.qualityLimitation = stat.qualityLimitationReason;
                    }
                    break;

                case 'inbound-rtp':
                    if (stat.kind === 'video') {
                        inboundStats = stat;
                        result.inbound.jitter = stat.jitter;
                        if (stat.packetsLost > 0) {
                            result.inbound.packetLoss =
                                (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) * 100;
                        }
                    }
                    break;

                case 'candidate-pair':
                    if (stat.state === 'succeeded') {
                        result.connection.roundTripTime = stat.currentRoundTripTime;
                    }
                    break;
            }
        });

        // Calculate bitrates using previous stats
        if (this.previousStats && outboundStats && inboundStats) {
            const timeDelta = (outboundStats.timestamp - this.previousStats.outboundTimestamp) / 1000;  // Convert to seconds

            if (timeDelta > 0) {
                // Calculate outbound bitrate
                const bytesSentDelta = outboundStats.bytesSent - this.previousStats.bytesSent;
                result.outbound.bitrate = (bytesSentDelta * 8) / timeDelta;  // Convert to bits per second

                // Calculate inbound bitrate
                const bytesReceivedDelta = inboundStats.bytesReceived - this.previousStats.bytesReceived;
                result.inbound.bitrate = (bytesReceivedDelta * 8) / timeDelta;  // Convert to bits per second
            }
        }

        // Store current stats for next calculation
        if (outboundStats && inboundStats) {
            this.previousStats = {
                outboundTimestamp: outboundStats.timestamp,
                bytesSent: outboundStats.bytesSent,
                bytesReceived: inboundStats.bytesReceived
            };
        }

        return result;
    }

    /**
     * Get a snapshot of current connection statistics
     * @returns {Promise<ConnectionStats>} Current connection statistics
     */
    async getConnectionStats() {
        return this._gatherConnectionStats();
    }

    /**
     * Gather current connection statistics per stream
     * @private
     * @returns {Promise<Map<string, StreamStats>>} Map of session IDs to stream stats
     */
    async _gatherStreamStats() {
        if (!this.peerConnection) return new Map();

        const stats = await this.peerConnection.getStats();
        const streamStats = new Map();

        // Initialize local stats
        if (this.sessionId) {
            streamStats.set(this.sessionId, {
                sessionId: this.sessionId,
                packetLoss: 0,
                qualityLimitation: 'none',
                bitrate: 0
            });
        }

        stats.forEach(stat => {
            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                // Update local stream stats
                const localStats = streamStats.get(this.sessionId);
                if (localStats) {
                    localStats.qualityLimitation = stat.qualityLimitationReason;
                    localStats.bitrate = stat.bytesSent * 8 / stat.timestamp;
                }
            }
            else if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                // Get sessionId from mid mapping
                const mid = stat.mid;
                const sessionId = this.midToSessionId.get(mid);

                if (sessionId) {
                    streamStats.set(sessionId, {
                        sessionId,
                        packetLoss: stat.packetsLost > 0
                            ? (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) * 100
                            : 0,
                        qualityLimitation: 'none',
                        bitrate: stat.bytesReceived * 8 / stat.timestamp
                    });
                }
            }
        });

        return streamStats;
    }

    // Add static QUALITY_PRESETS
    static QUALITY_PRESETS = {
        // 16:9 Presets
        high_16x9_xl: {  // 1080p
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
                maxBitrate: 2_500_000
            },
            audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 }
        },
        high_16x9_lg: {  // 720p
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                maxBitrate: 1_500_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 2 }
        },
        high_16x9_md: {  // 480p
            video: {
                width: { ideal: 854 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        high_16x9_sm: {  // 360p
            video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 30 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        high_16x9_xs: {  // 270p
            video: {
                width: { ideal: 480 },
                height: { ideal: 270 },
                frameRate: { ideal: 30 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },

        // 16:9 Medium Quality Presets (reduced framerate & bitrate)
        medium_16x9_xl: {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 24 },
                maxBitrate: 2_000_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 2 }
        },
        medium_16x9_lg: {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 24 },
                maxBitrate: 1_200_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        medium_16x9_md: {
            video: {
                width: { ideal: 854 },
                height: { ideal: 480 },
                frameRate: { ideal: 24 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        medium_16x9_sm: {
            video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 20 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_16x9_xs: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 270 },
                frameRate: { ideal: 20 },
                maxBitrate: 300_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },

        // 16:9 Low Quality Presets (minimum viable quality)
        low_16x9_xl: {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 15 },
                maxBitrate: 1_500_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        low_16x9_lg: {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 15 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        low_16x9_md: {
            video: {
                width: { ideal: 854 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 }
        },
        low_16x9_sm: {
            video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 12 },
                maxBitrate: 250_000
            },
            audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 }
        },
        low_16x9_xs: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 270 },
                frameRate: { ideal: 10 },
                maxBitrate: 150_000
            },
            audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 }
        },

        // 4:3 High Quality Presets (existing)
        high_4x3_xl: {  // 960x720
            video: {
                width: { ideal: 960 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                maxBitrate: 1_500_000
            },
            audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 }
        },
        high_4x3_lg: {  // 640x480
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        high_4x3_md: {  // 480x360
            video: {
                width: { ideal: 480 },
                height: { ideal: 360 },
                frameRate: { ideal: 30 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 96000, sampleRate: 44100, channelCount: 1 }
        },
        high_4x3_sm: {  // 320x240
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 30 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        high_4x3_xs: {  // 240x180 (perfect for 300x225 container)
            video: {
                width: { ideal: 240 },
                height: { ideal: 180 },
                frameRate: { ideal: 30 },
                maxBitrate: 250_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },

        // 4:3 Medium Quality Presets
        medium_4x3_xl: {
            video: {
                width: { ideal: 960 },
                height: { ideal: 720 },
                frameRate: { ideal: 24 },
                maxBitrate: 1_200_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        medium_4x3_lg: {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        medium_4x3_md: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 360 },
                frameRate: { ideal: 20 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_4x3_sm: {
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 20 },
                maxBitrate: 300_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_4x3_xs: {
            video: {
                width: { ideal: 240 },
                height: { ideal: 180 },
                frameRate: { ideal: 20 },
                maxBitrate: 200_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },

        // 4:3 Low Quality Presets
        low_4x3_xl: {
            video: {
                width: { ideal: 960 },
                height: { ideal: 720 },
                frameRate: { ideal: 15 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        low_4x3_lg: {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 },
                maxBitrate:400_000
            },
            audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 }
        },
        low_4x3_md: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 360 },
                frameRate: { ideal: 12 },
                maxBitrate: 250_000
            },
            audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 }
        },
        low_4x3_sm: {
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 10 },
                maxBitrate: 150_000
            },
            audio: { maxBitrate: 32000,sampleRate: 44100, channelCount: 1 }
        },
        low_4x3_xs: {
            video: {
                width: { ideal: 240 },
                height: { ideal: 180 },
                frameRate: { ideal: 10 },
                maxBitrate: 100_000
            },
            audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 }
        },

        // 1:1 High Quality Presets
        high_1x1_xl: {  // 720x720
            video: {
                width: { ideal: 720 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                maxBitrate: 1_500_000
            },
            audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 }
        },
        high_1x1_lg: {  // 480x480
            video: {
                width: { ideal: 480 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        high_1x1_md: {  // 360x360
            video: {
                width: { ideal: 360 },
                height: { ideal: 360 },
                frameRate: { ideal: 30 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 96000, sampleRate: 44100, channelCount: 1 }
        },
        high_1x1_sm: {  // 240x240
            video: {
                width: { ideal: 240 },
                height: { ideal: 240 },
                frameRate: { ideal: 30 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        high_1x1_xs: {  // 180x180
            video: {
                width: { ideal: 180 },
                height: { ideal: 180 },
                frameRate: { ideal: 30 },
                maxBitrate: 250_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },

        // 1:1 Medium Quality Presets
        medium_1x1_xl: {
            video: {
                width: { ideal: 720 },
                height: { ideal: 720 },
                frameRate: { ideal: 24 },
                maxBitrate: 1_200_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        medium_1x1_lg: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 480 },
                frameRate: { ideal: 24 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        medium_1x1_md: {
            video: {
                width: { ideal: 360 },
                height: { ideal: 360 },
                frameRate: { ideal: 20 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_1x1_sm: {
            video: {
                width: { ideal: 240 },
                height: { ideal: 240 },
                frameRate: { ideal: 20 },
                maxBitrate: 300_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_1x1_xs: {
            video: {
                width: { ideal: 180 },
                height: { ideal: 180 },
                frameRate: { ideal: 20 },
                maxBitrate: 200_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },

        // 1:1 Low Quality Presets
        low_1x1_xl: {
            video: {
                width: { ideal: 720 },
                height: { ideal: 720 },
                frameRate: { ideal: 15 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        low_1x1_lg: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 }
        },
        low_1x1_md: {
            video: {
                width: { ideal: 360 },
                height: { ideal: 360 },
                frameRate: { ideal: 12 },
                maxBitrate: 250_000
            },
            audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 }
        },
        low_1x1_sm: {
            video: {
                width: { ideal: 240 },
                height: { ideal: 240 },
                frameRate: { ideal: 10 },
                maxBitrate: 150_000
            },
            audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 }
        },
        low_1x1_xs: {
            video: {
                width: { ideal: 180 },
                height: { ideal: 180 },
                frameRate: { ideal: 10 },
                maxBitrate: 100_000
            },
            audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 }
        },

        // 9:16 High Quality Presets (Portrait/Mobile)
        high_9x16_xl: {  // 1080x1920
            video: {
                width: { ideal: 1080 },
                height: { ideal: 1920 },
                frameRate: { ideal: 30 },
                maxBitrate: 2_500_000
            },
            audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 }
        },
        high_9x16_lg: {  // 720x1280
            video: {
                width: { ideal: 720 },
                height: { ideal: 1280 },
                frameRate: { ideal: 30 },
                maxBitrate: 1_500_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        high_9x16_md: {  // 480x854
            video: {
                width: { ideal: 480 },
                height: { ideal: 854 },
                frameRate: { ideal: 30 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 96000, sampleRate: 44100, channelCount: 1 }
        },
        high_9x16_sm: {  // 360x640
            video: {
                width: { ideal: 360 },
                height: { ideal: 640 },
                frameRate: { ideal: 30 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        high_9x16_xs: {  // 270x480
            video: {
                width: { ideal: 270 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },

        // 9:16 Medium Quality Presets
        medium_9x16_xl: {
            video: {
                width: { ideal: 1080 },
                height: { ideal: 1920 },
                frameRate: { ideal: 24 },
                maxBitrate: 2_000_000
            },
            audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 }
        },
        medium_9x16_lg: {
            video: {
                width: { ideal: 720 },
                height: { ideal: 1280 },
                frameRate: { ideal: 24 },
                maxBitrate: 1_200_000
            },
            audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 }
        },
        medium_9x16_md: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 854 },
                frameRate: { ideal: 20 },
                maxBitrate: 600_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_9x16_sm: {
            video: {
                width: { ideal: 360 },
                height: { ideal: 640 },
                frameRate: { ideal: 20 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        medium_9x16_xs: {
            video: {
                width: { ideal: 270 },
                height: { ideal: 480 },
                frameRate: { ideal: 20 },
                maxBitrate: 300_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },

        // 9:16 Low Quality Presets
        low_9x16_xl: {
            video: {
                width: { ideal: 1080 },
                height: { ideal: 1920 },
                frameRate: { ideal: 15 },
                maxBitrate: 1_500_000
            },
            audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 }
        },
        low_9x16_lg: {
            video: {
                width: { ideal: 720 },
                height: { ideal: 1280 },
                frameRate: { ideal: 15 },
                maxBitrate: 800_000
            },
            audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 }
        },
        low_9x16_md: {
            video: {
                width: { ideal: 480 },
                height: { ideal: 854 },
                frameRate: { ideal: 12 },
                maxBitrate: 400_000
            },
            audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 }
        },
        low_9x16_sm: {
            video: {
                width: { ideal: 360 },
                height: { ideal: 640 },
                frameRate: { ideal: 10 },
                maxBitrate: 250_000
            },
            audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 }
        },
        low_9x16_xs: {
            video: {
                width: { ideal: 270 },
                height: { ideal: 480 },
                frameRate: { ideal: 10 },
                maxBitrate: 150_000
            },
            audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 }
        }
    };
}

export default CloudflareCalls;
