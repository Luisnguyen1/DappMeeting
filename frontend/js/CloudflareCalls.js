import "https://cdn.jsdelivr.net/npm/web3@1.6.1/dist/web3.min.js";
import { CONTRACT_ABI } from "../../abi.js";
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
    this.backendUrl = config.backendUrl || "";
    this.websocketUrl = config.websocketUrl || "";
    this.debug = config.debug || false;

    this.backendUrl2 = config.backendUrl2 || "";
    this.websocketUrl2 = config.websocketUrl2 || "";
    this.token = sessionStorage.getItem("token");
    this.userId = sessionStorage.getItem("userId");

    this.roomId = null;
    this.sessionId = null;
    // this.userId = this._generateUUID();

    this.userMetadata = {};

    this.localStream = null;
    this.peerConnection = null;
    this.ws = null;
    this.ws2 = null;
    // Specific message handlers
    this._onParticipantJoinedCallback = null;
    this._onParticipantLeftCallback = null;
    this._onRemoteTrackCallback = null;
    this._onRemoteTrackUnpublishedCallback = null;
    this._onTrackStatusChangedCallback = null;
    this._onDataMessageCallback = null;
    this._onConnectionStatsCallback = null;

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
    this.statsMonitoringState = "stopped";
    this.responeWebsocket = {};
    this.responeSmartcontract = {};
    this.privateKey =
      "0x50f84e6f2a3b754a11614c0ab26446b416ba0f1672202c0da9283e8b41d2a4cc";
    this.contractAddress = "0x8B2aE810C4436F8Ec046F923e12716Ab788205e8";
    const rpcURL = "wss://bsc-testnet-rpc.publicnode.com";

    this.web3 = new Web3(new Web3.providers.WebsocketProvider(rpcURL));
    this.account = this.web3.eth.accounts.privateKeyToAccount(this.privateKey);
    this.web3.eth.accounts.wallet.add(this.account);
    this.contract = new this.web3.eth.Contract(
      CONTRACT_ABI,
      this.contractAddress
    );
    console.log("Contract:", this.contract);
    console.log("Contract:", this.websocketUrl2);
    if (this.websocketUrl2 != "") {
      this.ws2 = new WebSocket(this.websocketUrl2);
      this.ws2.onopen = async () => {
        // send sự kiện
        console.log("WebSocket open0");
        this.ws2.onopen = () => {
          this._log("WebSocket open");
          console.log("WebSocket open1");
        };
      };
      this.ws2.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("Message:", message);

          if (message.type === "auth-token") {
            this.setToken(message.payload.token, message.payload.userId);
            console.log("Settoken onmessage:", message.payload);
            if (typeof this.ws2callback["auth-token"] == "function") {
              this.ws2callback["auth-token"](true);
              delete this.ws2callback["auth-token"];
            }
            return;
          } else if (message.type === "create-room") {
            this.roomId = message.payload.roomId;

            if (typeof this.ws2callback["create-room"] == "function") {
              this.ws2callback["create-room"](this.roomId);
              delete this.ws2callback["create-room"];
            }
            return;
          } else if (message.type === "join-room") {
            const sessionId = message.payload.sessionId;
            console.log("Session ID:", sessionId);
            if (typeof this.ws2callback["join-room"] === "function") {
              this.ws2callback["join-room"](sessionId);
              delete this.ws2callback["join-room"];
            }
            return;
          } else if (message.type === "publish-tracks") {
            if (typeof this.ws2callback["publish-tracks"] === "function") {
              const sessionDescription = message.payload.sessionDescription;
              this.ws2callback["publish-tracks"](sessionDescription);
              delete this.ws2callback["publish-tracks"];
            }
            return;
          } else if (message.type === "pull-tracks") {
            if (typeof this.ws2callback["pull-tracks"] === "function") {
              const sessionDescription = message.payload.sessionDescription,
                requiresImmediateRenegotiation =
                  message.payload.requiresImmediateRenegotiation;
              this.ws2callback["pull-tracks"](
                sessionDescription,
                requiresImmediateRenegotiation
              );
              delete this.ws2callback["pull-tracks"];
            }
            return;
          } else if (message.type === "renegotiate-session") {
            if (typeof this.ws2callback["renegotiate-session"] === "function") {
              this.ws2callback["renegotiate-session"]();
              delete this.ws2callback["renegotiate-session"];
            }
            return;
          } else if (message.type === "get-participants") {
            if (typeof this.ws2callback["get-participants"] === "function") {
              this.ws2callback["get-participants"](
                message.payload.participants
              );
              delete this.ws2callback["get-participants"];
            }
            return;
          } else if (message.type === "get-ice-servers") {
            if (typeof this.ws2callback["get-ice-servers"] === "function") {
              this.ws2callback["get-ice-servers"](message.payload.iceServers);
              delete this.ws2callback["get-ice-servers"];
            }
            return;
          } else if (message.type === "get-session-state") {
            if (typeof this.ws2callback["get-session-state"] === "function") {
              this.ws2callback["get-session-state"](message.payload.state);
              delete this.ws2callback["get-session-state"];
            }
            return;
          }else if (message.type === "unpublish-track") {
            if (typeof this.ws2callback["unpublish-track"] === "function") {
              this.ws2callback["unpublish-track"](message.payload.sessionDescription);
              delete this.ws2callback["unpublish-track"];
            }
            return;
          }else if (message.type === "leave-room") {
            if (typeof this.ws2callback["leave-room"] === "function") {
              this.ws2callback["leave-room"]();
              delete this.ws2callback["leave-room"];
            }
            return;
          }else if (message.type === "update-track-status") {
            if (typeof this.ws2callback["update-track-status"] === "function") {
              this.ws2callback["update-track-status"]();
              delete this.ws2callback["update-track-status"];
            }
            return;
          }

          this._error(
            "Error processing WebSocket2 message: Not found type ",
            message
          );
        } catch (error) {
          this._error("Error processing WebSocket2 message:", error);
        }
      };

      this.ws2.onerror = (err) => {
        this._error("WebSocket2 error:", err);
      };

      this.ws2.onclose = () => {
        this._log("WebSocket2 connection closed");
      };
    }

    this.ws2callback = {};
  }
  async inauthtoken(username, cb) {
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["auth-token"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "auth-token",
          payload: {
            username: username,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.inauthtoken(username, cb);
    }, 1000);
    console.log("inauthtoken1");
  }
  async ws2CreateRoom(name, metadata, cb) {
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["create-room"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "create-room",
          payload: {
            name,
            metadata,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2CreateRoom(name, metadata, cb);
    }, 1000);
    console.log("inauthCreateRoom retrying...");
  }

  async ws2JoinRoom(roomId, userId, metadata, cb) {
    console.log("joinRoom send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["join-room"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "join-room",
          payload: {
            roomId,
            userId,
            metadata,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2JoinRoom(roomId, userId, metadata, cb);
    }, 1000);
    console.log("ws2JoinRoom retrying...");
  }
  async ws2trackPublish(roomId, sessionId, offer, tracks, cb) {
    console.log("Trackpublish send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["publish-tracks"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "publish-tracks",
          payload: {
            roomId,
            sessionId,
            offer,
            tracks,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2trackPublish(roomId, sessionId, offer, tracks, cb);
    }, 1000);
    console.log("ws2JoinRoom retrying...");
  }
  async ws2trackPull(roomId, sessionId, remoteSessionId, trackName, cb) {
    console.log("pull-tracks send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["pull-tracks"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "pull-tracks",
          payload: {
            roomId,
            sessionId,
            remoteSessionId,
            trackName,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2trackPull(roomId, sessionId, remoteSessionId, trackName);
    }, 1000);
    console.log("pull-tracks retrying...");
  }
  async ws2renegotiate(roomId, sessionId, sdp, type, cb) {
    console.log("renegotiate-session send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["renegotiate-session"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "renegotiate-session",
          payload: {
            roomId,
            sessionId,
            sdp,
            type,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2renegotiate(roomId, sessionId, sdp, type, cb);
    }, 1000);
    console.log("renegotiate-session retrying...");
  }
  async ws2listParticipants(roomId, cb) {
    console.log("get-participants send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["get-participants"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "get-participants",
          payload: {
            roomId,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2renegotiate(roomId, cb);
    }, 1000);
    console.log("get-participants retrying...");
  }
  async ws2IceServer(iceServers, cb) {
    console.log("get-ice-servers send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["get-ice-servers"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "get-ice-servers",
          payload: {
            iceServers,
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2IceServer(iceServers, cb);
    }, 1000);
    console.log("get-ice-servers retrying...");
  }
  async ws2getSessionState(roomId, sessionId, cb) {
    console.log("get-session-state send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["get-session-state"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "get-session-state",
          payload: {
            roomId, sessionId
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2getSessionState(roomId, sessionId, cb);
    }, 1000);
    console.log("get-session-state retrying...");
  }
  async ws2unpublish(roomId, sessionId,trackId, mid, force,sessionDescription, cb) {
    console.log("unpublish-track send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["unpublish-track"] = cb;
      this.ws2.send(
        JSON.stringify({
          type: "unpublish-track",
          payload: {
            roomId, sessionId,trackId, mid, force,sessionDescription
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2unpublish(roomId, sessionId,trackId, mid, force,sessionDescription, cb);
    }, 1000);
    console.log("unpublish-track retrying...");
  }
  async ws2leave(roomId, sessionId) {
    console.log("leave-room send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["leave-room"] = "";
      this.ws2.send(
        JSON.stringify({
          type: "leave-room",
          payload: {
            roomId, sessionId
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2leave(roomId, sessionId);
    }, 1000);
    console.log("leave-room retrying...");
  }
  async ws2updateTrackStatus(roomId, sessionId,trackId,kind,enabled,force,cb) {
    console.log("update-track-status send1:", this.ws2);
    if (this.ws2 && this.ws2.readyState === WebSocket.OPEN) {
      this.ws2callback["update-track-status"] = "";
      this.ws2.send(
        JSON.stringify({
          type: "update-track-status",
          payload: {
            roomId, sessionId, trackId,kind,enabled,force
          },
        })
      );
      return;
    }
    setTimeout(() => {
      this.ws2updateTrackStatus(roomId, sessionId,trackId,kind,enabled,force,cb);
    }, 1000);
    console.log("update-track-status retrying...");
  }
  /**
   * Internal logging method that only outputs when debug is enabled
   * @private
   * @param {...any} args - Arguments to pass to console.log
   */
  _log(...args) {
    if (this.debug) {
      console.log("[CloudflareCalls]", ...args);
    }
  }

  /**
   * Internal warning method that only outputs when debug is enabled
   * @private
   * @param {...any} args - Arguments to pass to console.warn
   */
  _warn(...args) {
    if (this.debug) {
      console.warn("[CloudflareCalls]", ...args);
    }
  }

  /**
   * Internal error method that always outputs (important for debugging)
   * @private
   * @param {...any} args - Arguments to pass to console.error
   */
  _error(...args) {
    console.error("[CloudflareCalls]", ...args);
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
      options.headers["Authorization"] = `Bearer ${this.token}`;
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

  /************************************************
   * User Metadata Management
   ***********************************************/

  /**
   * Sets the user token for server requests. This should be a JWT token, and will be delivered in Authorization headers (HTTP) and to authenticate websocket join requests.
   * @param {String} token - The metadata to associate with the user.
   */
  setToken(token, userId) {
    this.token = token;
    this.userId = userId;
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("userId", userId);
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
      this._warn("Cannot update metadata before joining a room.");
      return;
    }

    try {
      const updateUrl = `${this.backendUrl}/api/rooms/${this.roomId}/metadata`;
      const response = await this._fetch(updateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.userMetadata),
      });

      if (!response.ok) {
        this._error("Failed to update user metadata on server.");
      } else {
        this._log("User metadata updated on server.");
      }
    } catch (error) {
      this._error("Error updating user metadata:", error);
      throw error;
    }
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
  async createRoom(options = {}, cb) {
    this.ws2CreateRoom(options.name, options.metadata, cb);
    // const resp = await this._fetch(`${this.backendUrl}/api/rooms`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(options)
    // }).then(r => r.json());

    //     console.log('Create Room Response:', resp);
    //     // Store the roomId
    //     this.roomId = resp.roomId;

    //     // Return the full room object
    //     return resp;
    // }

    /**
     * Joins an existing room.
     * @async
     * @param {string} roomId - The ID of the room to join.
     * @param {Object} [metadata={}] - Optional metadata for the user.
     * @returns {Promise<void>}
     */
  }
  async joinRoom(roomId, metadata = {}, cb) {
    if (!roomId) {
      console.error("Error: roomId is null or undefined");
      return;
    }
    console.log("sessionID room1:", this.sessionId);
    const userId = this.userId;
    return new Promise(async (resolve, reject) => {
      console.log("Joining room3:", roomId);
      await this.ws2JoinRoom(roomId, userId, metadata, async (sessionId) => {
        console.log("Joining room3:", roomId);
        console.log("Joining sessionId:", sessionId);
        this.roomId = roomId;

        await this._initWebSocket();

        if (!sessionId) {
          throw new Error("Failed to join room or retrieve sessionId");
        }

        this.sessionId = sessionId;
        console.log("Joining sessionId:", this.sessionId);

        // Khởi tạo pulledTracks map
        this.pulledTracks.set(this.sessionId, new Set());
        console.log("Joining room4:");

        // Tạo RTCPeerConnection
        this.peerConnection = await this._createPeerConnection();

        // Lấy Local Media và Publish Tracks
        if (!this.localStream) {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          this._log("Acquired local media");
        }
        await this._publishTracks();

        // Pull tracks từ các participant khác (nếu có)
        // if(sessionId === null) {
        //     console.log("No Sesion ----------------------");
        //     return;
        // }
        if (
          typeof sessionId === "object" &&
          Array.isArray(sessionId.otherSessions)
        ) {
          const otherSessions = sessionId.otherSessions;
          //   async function pullTracksSequentially(sessions, index = 0) {
          //     // Điều kiện dừng: Nếu đã xử lý hết các phiên, thoát khỏi hàm
          //     if (index >= sessions.length) return;

          //     const s = sessions[index];
          //     this.pulledTracks.set(s.sessionId, new Set());

          //     const pullTrack = async (tracks, trackIndex = 0) => {
          //       // Điều kiện dừng cho tracks: Nếu hết tracks, chuyển sang phiên tiếp theo
          //       if (trackIndex >= tracks.length) {
          //         await pullTracksSequentially.call(this, sessions, index + 1);
          //         return;
          //       }

          //       const tName = tracks[trackIndex];
          //       await this._pullTracks(s.sessionId, tName);
          //       await pullTrack(tracks, trackIndex + 1);
          //     };

          //     await pullTrack(s.publishedTracks || []);
          //   }
          //   await pullTracksSequentially.call(this, sessionId.otherSessions);
          for (const s of otherSessions) {
            this.pulledTracks.set(s.sessionId, new Set());
            for (const tName of s.publishedTracks || []) {
              await this._pullTracks(s.sessionId, tName);
            }
          }
        } else {
          console.log("No other sessions or invalid session data.");
        }

        this._log("Joined room", roomId, "my session:", this.sessionId);

        // Cập nhật metadata người dùng
        this.setUserMetadata(metadata);

        // Bắt đầu polling các track mới
        this._startPolling();
        resolve();
      });
    });
    // Thực hiện join room qua WebSocket
  }
  // async joinRoom(roomId, metadata = {}) {
  //         this.roomId = roomId;

  //         // 1) Ask server to create a CF Calls session
  //         const joinResp = await this._fetch(`${this.backendUrl}/api/rooms/${roomId}/join`, {
  //             method: 'POST',
  //             headers: { 'Content-Type': 'application/json' },
  //             body: JSON.stringify({ userId: this.userId, metadata: this.userMetadata })
  //         }).then(r => r.json());

  //         console.log('Join Room Response:', joinResp);
  //         await this._initWebSocket();

  //         if (!joinResp.sessionId) {
  //             throw new Error('Failed to join room or retrieve sessionId');
  //         }
  //         this.sessionId = joinResp.sessionId;

  //         // Initialize pulledTracks map
  //         this.pulledTracks.set(this.sessionId, new Set());

  //         // 2) Create RTCPeerConnection
  //         this.peerConnection = await this._createPeerConnection();

  //         // 3) Get Local Media and Publish Tracks
  //         if (!this.localStream) {
  //             this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  //             this._log('Acquired local media');
  //         }
  //         await this._publishTracks();

  //         // 4) Pull other participants' tracks
  //         const otherSessions = joinResp.otherSessions || [];
  //         for (const s of otherSessions) {
  //             this.pulledTracks.set(s.sessionId, new Set());
  //             for (const tName of s.publishedTracks || []) {
  //                 await this._pullTracks(s.sessionId, tName);
  //             }
  //         }
  //         this._log('Joined room', roomId, 'my session:', this.sessionId);

  //         this.setUserMetadata(metadata);

  //         // 5) Start polling for new tracks
  //         this._startPolling();
  //     }
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
        if (track.readyState === "ended") {
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
    const senders = this.peerConnection.getSenders();
    if (senders && senders.length) {
      
    }

    try {
        await this.unpublishAllTracks();
        await this.ws2leave(this.roomId, this.sessionId, () => {
            this._log("Successfully left the room.");
        });
        
    //   await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/leave`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ sessionId: this.sessionId }),
    //   });
    } catch (error) {
      this._warn("Error leaving room:", error);
    }

    // Clean up WebSocket
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

    this._log("Left room, closed PC & WS");

    // Reset room state
    this.roomId = null;
    this.sessionId = null;
    this.pulledTracks.clear();
    this.midToSessionId.clear();
    this.midToTrackName.clear();
    this.publishedTracks.clear();
  }

  /************************************************
   * Publish & Pull
   ***********************************************/

  /**
   * Publishes the local media tracks to the room.
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If there is no local media stream to publish.
   */
  async publishTracks() {
    if (!this.localStream) {
      return this._warn("No local media stream to publish.");
    }
    await this._publishTracks();
  }

  // /**
  //  * Unpublishes a specific local media track (audio or video).
  //  * @async
  //  * @param {string} trackKind - The kind of track to unpublish ('audio' or 'video').
  //  * @param {boolean} [force=false] - If true, forces track closure without renegotiation.
  //  * @returns {Promise<Object>} Result object from the Cloudflare API.
  //  * @throws {Error} If PeerConnection is not established or track is not found.
  //  */
  // // Todo: I don't think this method works
  // async unpublishTrack(trackKind, force = false) {
  //     if (!this.peerConnection) {
  //         return this._warn('PeerConnection is not established.');
  //     }
  //
  //     const sender = this.peerConnection.getSenders().find(s => s.track?.kind === trackKind);
  //     if (!sender) {
  //         return this._warn(`No ${trackKind} track found to unpublish.`);
  //     }
  //
  //     const transceiver = this.peerConnection.getTransceivers().find(t => t.sender === sender);
  //     if (!transceiver?.mid) {
  //         throw new Error('Could not find transceiver mid for track');
  //     }
  //
  //     try {
  //         // Create an offer for the updated state
  //         const offer = await this.peerConnection.createOffer();
  //         await this.peerConnection.setLocalDescription(offer);
  //
  //         const unpublishUrl = `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/unpublish`;
  //         const response = await this._fetch(unpublishUrl, {
  //             method: 'POST',
  //             headers: { 'Content-Type': 'application/json' },
  //             body: JSON.stringify({
  //                 trackName: sender.track.id,
  //                 mid: transceiver.mid,
  //                 force,
  //                 sessionDescription: {
  //                     type: offer.type,
  //                     sdp: offer.sdp
  //                 }
  //             })
  //         });
  //
  //         if (!response || !response.ok) return false;
  //         const result = await response.json();
  //
  //         // Stop the track
  //         sender.track.stop();
  //
  //         // Remove from PeerConnection after server confirms
  //         this.peerConnection.removeTrack(sender);
  //
  //         // Remove from our tracked set
  //         this.publishedTracks.delete(sender.track.id);
  //
  //         return result;
  //     } catch (error) {
  //         this._warn(`Error unpublishing ${trackKind} track:`, error);
  //         return false;
  //     }
  // }

  /**
   * Initiates renegotiation of the PeerConnection.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async _renegotiate() {
    if (!this.peerConnection) return;

    if (this._renegotiateTimeout) {
      clearTimeout(this._renegotiateTimeout);
    }

    this._renegotiateTimeout = setTimeout(async () => {
      try {
        this._log("Starting renegotiation process...");
        const answer = await this.peerConnection.createAnswer();
        this._log("Created renegotiation answer:", answer.sdp);
        await this.peerConnection.setLocalDescription(answer);

        const renegotiateUrl = `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/renegotiate`;
        const body = { sdp: answer.sdp, type: answer.type };
        this._log(
          `Sending renegotiate request to ${renegotiateUrl} with body:`,
          body
        );

        const response = await this._fetch(renegotiateUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json());

        if (response.errorCode) {
          this._warn("Renegotiation failed:", response.errorDescription);
          return;
        }

        await this.peerConnection.setRemoteDescription(
          response.sessionDescription
        );
        this._log("Renegotiation successful. Applied SFU response.");
      } catch (error) {
        this._error("Error during renegotiation:", error);
      }
    }, 500);
  }

  /**
   * Updates the published media tracks.
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If the PeerConnection is not established.
   */
  // Todo: I don't know what this was supposed to accomplish
  // Possibly unpublish and re-publish tracks to solve some lifecycle issue
  async updatePublishedTracks() {
    if (!this.peerConnection) {
      return this._warn("PeerConnection is not established.");
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
   * Publishes the local media tracks to the PeerConnection and server.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async _publishTracks() {
    if (!this.localStream || !this.peerConnection) return;

    const transceivers = [];
    for (const track of this.localStream.getTracks()) {
      // Check if we've already published this track
      if (this.publishedTracks.has(track.id)) continue;
      if (track.readyState !== "live") continue;

      const tx = this.peerConnection.addTransceiver(track, {
        direction: "sendonly",
      });

      // Apply any pending quality settings to video tracks
      if (this.pendingQualitySettings && track.kind === "video") {
        const params = tx.sender.getParameters();
        params.encodings = [
          {
            maxBitrate: this.pendingQualitySettings.video.maxBitrate,
          },
        ];
        tx.sender.setParameters(params);
      }

      transceivers.push(tx);
      this.publishedTracks.add(track.id);
    }

    if (transceivers.length === 0) return; // No new tracks to publish

    const offer = await this.peerConnection.createOffer();
    this._log("SDP Offer:", offer.sdp);
    await this.peerConnection.setLocalDescription(offer);

    const trackInfos = transceivers.map(({ sender, mid }) => ({
      location: "local",
      mid,
      trackName: sender.track.id,
    }));

    const body = {
      offer: { sdp: offer.sdp, type: offer.type },
      tracks: trackInfos,
      metadata: this.userMetadata,
    };

    // ws2Publishtracks
    console.log("publishtrack2:", body);
    const roomId = this.roomId;

    return new Promise(async (resolve, reject) => {
      await this.ws2trackPublish(
        roomId,
        this.sessionId,
        { sdp: offer.sdp, type: offer.type },
        trackInfos,
        async (sessionDescription) => {
          console.log("publishtrack2 sessionId:", sessionDescription);

          await this.peerConnection.setRemoteDescription(sessionDescription);
          this._log("Publish => success. Applied SFU answer.");
          resolve();
        }
      );
    });

    // const publishUrl = `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/publish`;
    // const resp = await this._fetch(publishUrl, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(body)
    // }).then(r => r.json());

    // if (resp.errorCode) {
    //     this._error('Publish error:', resp.errorDescription);
    //     return;
    // }
    // The SFU's answer
  }

  /**
   * Pulls a specific track from a remote session.
   * @async
   * @private
   * @param {string} remoteSessionId - The session ID of the remote participant.
   * @param {string} trackName - The name of the track to pull.
   * @returns {Promise<void>}
   */
  async _Renegotiation(sdp, type) {
    return new Promise(async (resolve, reject) => {
      await this.ws2renegotiate(this.roomId, this.sessionId, sdp, type, () => {
        resolve();
      });
    });
  }

  async _pullTracks(remoteSessionId, trackName) {
    return new Promise(async (resolve, reject) => {
      this._log(`Pulling track '${trackName}' from session ${remoteSessionId}`);

      await this.ws2trackPull(
        this.roomId,
        this.sessionId,
        remoteSessionId,
        trackName,
        async (sessionDescription, requiresImmediateRenegotiation) => {
          console.log("publishtrack2 sessionId:", sessionDescription);

          if (requiresImmediateRenegotiation) {
            this._log("Pull => requires renegotiation");

            // Set up both mappings from the SDP
            const pendingMids = new Set();
            sessionDescription.sdp.split("\n").forEach((line) => {
              if (line.startsWith("a=mid:")) {
                const mid = line.split(":")[1].trim();
                pendingMids.add(mid);
                this.midToSessionId.set(mid, remoteSessionId);
                this.midToTrackName.set(mid, trackName);
                this._log("Pre-mapped MID:", {
                  mid,
                  sessionId: remoteSessionId,
                  trackName,
                });
              }
            });

            // Now set the remote description
            await this.peerConnection.setRemoteDescription(sessionDescription);

            // Create and set local answer
            const localAnswer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(localAnswer);

            // Verify mappings are still correct
            const transceivers = this.peerConnection.getTransceivers();
            transceivers.forEach((transceiver) => {
              if (transceiver.mid && pendingMids.has(transceiver.mid)) {
                this._log("Verified MID mapping:", {
                  mid: transceiver.mid,
                  sessionId: remoteSessionId,
                  direction: transceiver.direction,
                });
              }
            });

            // await this._fetch(`${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/renegotiate`, {
            //     method: 'PUT',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ sdp: localAnswer.sdp, type: localAnswer.type })
            // });
            await this._Renegotiation(localAnswer.sdp, localAnswer.type);
          }

          this._log(
            `Pulled trackName="${trackName}" from session ${remoteSessionId}`
          );
          this._log(
            "Current MID mappings:",
            Array.from(this.midToSessionId.entries())
          );

          // Record the pulled track
          if (!this.pulledTracks.has(remoteSessionId)) {
            this.pulledTracks.set(remoteSessionId, new Set());
          }
          this.pulledTracks.get(remoteSessionId).add(trackName);
          resolve();
        }
      );
    });
    // const pullUrl = `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/pull`;
    // const body = { remoteSessionId, trackName };
    // this.roomId = roomId;
    // const resp = await this._fetch(pullUrl, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(body)
    // }).then(r => r.json());

    // if (resp.errorCode) {
    //     this._error('Pull error:', resp.errorDescription);
    //     return;
    // }
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
    let iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];

    try {
      await new Promise((resolve, reject) => {
        this.ws2IceServer(iceServers, (iceServers) => {
          if (iceServers && Array.isArray(iceServers)) {
            iceServers = iceServers.map((server) => {
              // Ensure each server has the required fields
              const iceServer = { urls: server.urls };
              if (server.username && server.credential) {
                iceServer.username = server.username;
                iceServer.credential = server.credential;
              }
              return iceServer;
            });
            this._log("Fetched ICE servers:", iceServers);
          } else {
            resolve(iceServers); // Resolving with the iceServers value
          }
          resolve(); // Ensure to resolve the promise after processing
        });
      });
      //   const response = await this._fetch(`${this.backendUrl}/api/ice-servers`);
      //   if (!response.ok) {
      //     this._warn(
      //       `Failed to fetch ICE servers: ${response.status} ${response.statusText}`
      //     );
      //     return false;
      //   }

      //   const data = await response.json();

      // Validate and process the fetched ICE servers
    } catch (error) {
      this._warn("Error fetching ICE servers:", error);
      // Fallback to default ICE servers if fetching fails
      return false;
    }
  }
  async _createPeerConnection() {
    let iceServers = (await this._attemptIceServersUpdate()) || [
      { urls: "stun:stun.cloudflare.com:3478" },
    ];

    const pc = new RTCPeerConnection({
      iceServers: iceServers,
      bundlePolicy: "max-bundle",
      sdpSemantics: "unified-plan",
    });

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        this._log("New ICE candidate:", evt.candidate.candidate);
      } else {
        this._log("All ICE candidates have been sent");
      }
    };

    pc.oniceconnectionstatechange = () => {
      this._log("ICE Connection State:", pc.iceConnectionState);
      if (
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "failed"
      ) {
        this.leaveRoom();
      }
    };

    pc.onconnectionstatechange = () => {
      this._log("Connection State:", pc.connectionState);
      if (pc.connectionState === "connected") {
        this._log("Peer connection fully established");
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        this._log("Peer connection disconnected or failed");
        this.leaveRoom();
      }
    };

    pc.ontrack = (evt) => {
      this._log("ontrack event:", {
        kind: evt.track.kind,
        webrtcTrackId: evt.track.id,
        mid: evt.transceiver?.mid,
      });

      if (this._onRemoteTrackCallback) {
        const mid = evt.transceiver?.mid;
        const sessionId = this.midToSessionId.get(mid);
        const trackName = this.midToTrackName.get(mid);

        this._log("Track mapping lookup:", {
          mid,
          sessionId,
          trackName,
          webrtcTrackId: evt.track.id,
          availableMappings: {
            sessions: Array.from(this.midToSessionId.entries()),
            tracks: Array.from(this.midToTrackName.entries()),
          },
        });

        if (!sessionId) {
          this._warn("No sessionId found for mid:", mid);
          if (!this.pendingTracks) this.pendingTracks = [];
          this.pendingTracks.push({ evt, mid });
          return;
        }

        const wrappedTrack = evt.track;
        wrappedTrack.sessionId = sessionId;
        wrappedTrack.mid = mid;
        wrappedTrack.trackName = trackName;

        this._log("Sending track to callback:", {
          webrtcTrackId: wrappedTrack.id,
          trackName: wrappedTrack.trackName,
          sessionId: wrappedTrack.sessionId,
          mid: wrappedTrack.mid,
        });

        this._onRemoteTrackCallback(wrappedTrack);
      }
    };

    return pc;
  }

  /**
   * Initializes the WebSocket connection.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  // async _initSmartContract() {
  //     if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

  //     return new Promise((resolve, reject) => {
  //         // Initialize Web3
  //         const web3 = new Web3(window.ethereum);  // Using MetaMask's injected Web3 provider
  //         const contractAddress = "0x187015B75aDEaB4e64347198D5C3aBf117A1Fb85"; // Your contract address

  //         const contract = new web3.eth.Contract(CONTRACT_ABI, contractAddress);

  //         // Connect to WebSocket (if necessary)
  //         this.ws = new WebSocket(this.websocketUrl);

  //         this.ws.onopen = () => {
  //             this._log('WebSocket open');
  //             this.ws.send(JSON.stringify({
  //                 type: 'join-websocket',
  //                 payload: {
  //                     roomId: this.roomId,
  //                     userId: this.userId,
  //                     token: this.token
  //                 }
  //             }));
  //             resolve();
  //         };

  //         // Listen for contract events
  //         contract.events.ParticipantJoined({
  //             filter: { roomId: this.roomId }, // Optional: filter by room ID
  //             fromBlock: 'latest',
  //         })
  //         .on('data', (event) => {
  //             this._log('ParticipantJoined event:', event);
  //             if (this._onParticipantJoinedCallback) {
  //                 this._onParticipantJoinedCallback(event.returnValues);
  //             }
  //         })
  //         .on('error', (error) => {
  //             this._log('Error with ParticipantJoined event:', error);
  //         });

  //         contract.events.ParticipantLeft({
  //             filter: { roomId: this.roomId },
  //             fromBlock: 'latest',
  //         })
  //         .on('data', (event) => {
  //             this._log('ParticipantLeft event:', event);
  //             if (this._onParticipantLeftCallback) {
  //                 this._onParticipantLeftCallback(event.returnValues);
  //             }
  //         })
  //         .on('error', (error) => {
  //             this._log('Error with ParticipantLeft event:', error);
  //         });

  //         contract.events.TrackPublished({
  //             filter: { roomId: this.roomId },
  //             fromBlock: 'latest',
  //         })
  //         .on('data', (event) => {
  //             this._log('TrackPublished event:', event);
  //             if (this._onRemoteTrackCallback) {
  //                 this._onRemoteTrackCallback(event.returnValues);
  //             }
  //         })
  //         .on('error', (error) => {
  //             this._log('Error with TrackPublished event:', error);
  //         });

  //         contract.events.TrackUnpublished({
  //             filter: { roomId: this.roomId },
  //             fromBlock: 'latest',
  //         })
  //         .on('data', (event) => {
  //             this._log('TrackUnpublished event:', event);
  //             if (this._onRemoteTrackUnpublishedCallback) {
  //                 this._onRemoteTrackUnpublishedCallback(event.returnValues.sessionId, event.returnValues.trackName);
  //             }
  //         })
  //         .on('error', (error) => {
  //             this._log('Error with TrackUnpublished event:', error);
  //         });

  //         contract.events.DataMessageSent({
  //             filter: { roomId: this.roomId },
  //             fromBlock: 'latest',
  //         })
  //         .on('data', (event) => {
  //             this._log('DataMessageSent event:', event);
  //             if (this._onDataMessageCallback) {
  //                 this._onDataMessageCallback(event.returnValues);
  //             }
  //         })
  //         .on('error', (error) => {
  //             this._log('Error with DataMessageSent event:', error);
  //         });

  //         contract.events.RoomMetadataUpdated({
  //             filter: { roomId: this.roomId },
  //             fromBlock: 'latest',
  //         })
  //         .on('data', (event) => {
  //             this._log('RoomMetadataUpdated event:', event);
  //             if (this._onRoomMetadataUpdatedCallback) {
  //                 this._onRoomMetadataUpdatedCallback(event.returnValues);
  //             }
  //         })
  //         .on('error', (error) => {
  //             this._log('Error with RoomMetadataUpdated event:', error);
  //         });

  //         this.ws.onerror = (err) => {
  //             this._error('WebSocket error:', err);
  //             reject(err);
  //         };

  //         this.ws.onclose = () => {
  //             this._log('WebSocket connection closed');
  //         };
  //     });
  // }
  callbackmessage(message) {
    this._log("WebSocket message received:", message);
    // if(this.responeWebsocket[message.type] != this.responeSmartcontract[message.type]){
    //     console.log('Smartcontract response:', this.responeSmartcontract[message.type]);
    //     console.log('Websocket respone:', this.responeWebsocket[message.type]);
    //     return;
    // }

    // Handle specific message types
    switch (message.type) {
      case "participant-joined":
        if (this._onParticipantJoinedCallback) {
          this._onParticipantJoinedCallback(message.payload);
        }
        break;

      case "participant-left":
        if (this._onParticipantLeftCallback) {
          this._onParticipantLeftCallback(message.payload);
        }
        break;

      case "track-published":
        if (this._onRemoteTrackCallback) {
          // Handle track published event
          this._onRemoteTrackCallback(message.payload);
        }
        break;

      case "track-unpublished":
        if (this._onRemoteTrackUnpublishedCallback) {
          this._onRemoteTrackUnpublishedCallback(
            message.payload.sessionId,
            message.payload.trackName
          );
        }
        break;

      case "track-status-changed":
        if (this._onTrackStatusChangedCallback) {
          this._onTrackStatusChangedCallback(message.payload);
        }
        break;

      case "data-message":
        if (this._onDataMessageCallback) {
          this._onDataMessageCallback(message.payload);
        }
        break;

      case "room-metadata-updated":
        if (this._onRoomMetadataUpdatedCallback) {
          this._onRoomMetadataUpdatedCallback(message.payload);
        }
        break;

      default:
        this._log("Unhandled message type:", message.type);
    }

    // Notify generic handlers
    this._wsMessageHandlers.forEach((handler) => handler(message));
  }
  // code joinRoom
  // async joinRoomSC(typeStr, roomId, userId, token) {
  //     try {
  //         console.log("1",typeStr, roomId, userId, token);
  //         const tx = this.contract.methods.joinRoom(typeStr, roomId, userId, token);
  //         console.log("TX Object:", tx);
  //         console.log("2");
  //         console.log("2",this.account);
  //         // const gas = await tx.estimateGas({ from: this.account.address });
  //         console.log("3");

  //         const gasPrice = await this.web3.eth.getGasPrice();
  //         console.log("4");
  //         console.log("TX Object:", tx.encodeABI());

  //         const txData = {
  //             from: this.account.address,
  //             to: this.contractAddress,
  //             gas: 500000,
  //             gasPrice,
  //             data: tx.encodeABI(),
  //         };
  //         console.log("5");

  //         // Ký và gửi giao dịch
  //         const signedTx = await this.web3.eth.accounts.signTransaction(txData, this.privateKey);
  //         console.log("6");

  //         const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

  //         console.log("Transaction successful with hash:", receipt.transactionHash);
  //     } catch (error) {
  //         console.error("Error calling joinRoom:", error);
  //     }
  // }

  async _initWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    console.log("initsocket 1");
    return new Promise((resolve, reject) => {
      // code gọi smartcontract
      // this.contract.events.ParticipantJoined({
      //     fromBlock: 'latest'
      // })
      // .on('data', event => {
      //     console.log("New participant joined:", event.returnValues);
      //     try {
      //         const message = {
      //             type: event.returnValues.typeStr,
      //             payload: {
      //                 roomId: event.returnValues.roomId,
      //                 userId: event.returnValues.userId,
      //                 token: event.returnValues.token
      //             }}
      //         // if(this.responeWebsocket[message.type] == undefined){
      //         //     this.responeSmartcontract[message.type] = message;
      //         //     return ;
      //         // }
      //         this.callbackmessage(message);

      //     } catch (error) {
      //         this._error('Error processing WebSocket message:', error);
      //     }
      // })
      // .on('error', error => {
      //     console.error("Error listening for events:", error);
      // });
      // const typeStr = 'join-websocket';
      // setTimeout( async () =>{
      //         await this.joinRoomSC(typeStr,this.roomId, this.userId, this.token)
      //         resolve();
      //     },200)
      // return;
      this.ws = new WebSocket(this.websocketUrl);

      this.ws.onopen = async () => {
        // send sự kiện
        this.ws.onopen = () => {
          this._log("WebSocket open");
          this.ws.send(
            JSON.stringify({
              type: "join-websocket",
              payload: {
                roomId: this.roomId,
                userId: this.userId,
                token: this.token,
              },
            })
          );
          resolve();
        };
        resolve();
      };
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (this.responeSmartcontract[message.type] == undefined) {
            this.responeWebsocket[message.type] = message;
            return;
          }

          this.callbackmessage(message);
        } catch (error) {
          this._error("Error processing WebSocket message:", error);
        }
      };

      this.ws.onerror = (err) => {
        this._error("WebSocket error:", err);
        reject(err);
      };

      this.ws.onclose = () => {
        this._log("WebSocket connection closed");
      };
    });
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
        // const resp = await this._fetch(
        //   `${this.backendUrl}/api/rooms/${this.roomId}/participants`
        // ).then((r) => r.json());
        // const participants = resp.participants || [];
        await this.ws2listParticipants(this.roomId, async (participants) => {
          for (const participant of participants) {
            const { sessionId, publishedTracks } = participant;
            if (sessionId === this.sessionId) continue; // Skip self

            if (!this.pulledTracks.has(sessionId)) {
              this.pulledTracks.set(sessionId, new Set());
            }

            for (const trackName of publishedTracks) {
              if (!this.pulledTracks.get(sessionId).has(trackName)) {
                this._log(
                  `[Polling] New track detected: ${trackName} from session ${sessionId}`
                );
                await this._pullTracks(sessionId, trackName);
              }
            }
          }
        });
      } catch (err) {
        this._error("Polling error:", err);
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
    this.availableAudioInputDevices = devices.filter(
      (device) => device.kind === "audioinput"
    );
    this.availableVideoInputDevices = devices.filter(
      (device) => device.kind === "videoinput"
    );
    this.availableAudioOutputDevices = devices.filter(
      (device) => device.kind === "audiooutput"
    );

    return {
      audioInput: this.availableAudioInputDevices,
      videoInput: this.availableVideoInputDevices,
      audioOutput: this.availableAudioOutputDevices,
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
      this._warn("No deviceId provided for audio input.");
      return;
    }

    const constraints = {
      audio: { deviceId: { exact: deviceId } },
      video: false,
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newAudioTrack = newStream.getAudioTracks()[0];
      const sender = this.peerConnection
        .getSenders()
        .find((s) => s.track.kind === "audio");
      if (sender) {
        sender.replaceTrack(newAudioTrack);
        const oldTrack = sender.track;
        oldTrack.stop();
      } else {
        this.localStream.addTrack(newAudioTrack);
        await this._publishTracks();
      }

      this._log(`Switched to audio input device: ${deviceId}`);
    } catch (error) {
      this._error("Error switching audio input device:", error);
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
      this._warn("No deviceId provided for video input.");
      return;
    }

    const constraints = {
      video: { deviceId: { exact: deviceId } },
      audio: false,
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = this.peerConnection
        .getSenders()
        .find((s) => s.track.kind === "video");
      if (sender) {
        sender.replaceTrack(newVideoTrack);
        const oldTrack = sender.track;
        oldTrack.stop();
      } else {
        this.localStream.addTrack(newVideoTrack);
        await this._publishTracks();
      }

      this._log(`Switched to video input device: ${deviceId}`);
    } catch (error) {
      this._error("Error switching video input device:", error);
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
      this._warn("No deviceId provided for audio output.");
      return;
    }

    try {
      const audioElements = document.querySelectorAll("audio");
      for (const audio of audioElements) {
        await audio.setSinkId(deviceId);
      }
      this.currentAudioOutputDeviceId = deviceId;
      this._log(`Switched to audio output device: ${deviceId}`);
    } catch (error) {
      this._error("Error switching audio output device:", error);
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
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (previewElement) {
        previewElement.srcObject = stream;
      }
      return stream;
    } catch (error) {
      this._error("Error previewing media:", error);
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
      videoTracks.forEach((track) => {
        track.enabled = video;
        // Find the corresponding sender and update the track status
        const sender = this.peerConnection
          ?.getSenders()
          .find((s) => s.track === track);
        if (sender) {
          // Send track status update to SFU
          this._updateTrackStatus(sender.track.id, "video", video);
        }
      });
    }

    if (audio !== null) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = audio;
        // Find the corresponding sender and update the track status
        const sender = this.peerConnection
          ?.getSenders()
          .find((s) => s.track === track);
        if (sender) {
          // Send track status update to SFU
          this._updateTrackStatus(sender.track.id, "audio", audio);
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
      // Stop any existing video tracks (Todo: breaks the addTrack)
      await this.unpublishAllTracks("video");

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false, // Most browsers don't support screen audio yet
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      // Add the new screen track
      this.localStream.addTrack(screenTrack);

      // Publish the new track
      await this._publishTracks();

      // Handle the user stopping screen share
      screenTrack.onended = async () => {
        await this.unpublishAllTracks();
        await this._cleanupEndedTracks();

        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        this._log("Re-acquired local media");
        await this._publishTracks();
      };
    } catch (err) {
      this._error("Error sharing screen:", err);
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
      this._warn("WebSocket is not open. Cannot send message.");
      return;
    }
    this.ws.send(JSON.stringify(data));
    this._log("Sent WebSocket message:", data);
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
      return this._warn("Not connected to any room.");
    }
    return new Promise(async (resolve, reject) => {
      await this.ws2listParticipants(this.roomId, (participants) => {
        resolve(participants);
      });
      // const resp = await this._fetch(
      //     `${this.backendUrl}/api/rooms/${this.roomId}/participants`
      //   ).then((r) => r.json());

      //   return resp.participants || [];
    });
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
    return "xxxx-xxxx-xxxx-xxxx".replace(/[x]/g, () =>
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
      this._warn("PeerConnection is not established.");
      return;
    }
    if (!this.roomId || !this.sessionId) {
        this._warn("Room ID or Session ID is missing while unpublishing tracks.");
        return;
    }
    let senders = this.peerConnection.getSenders();
    if (trackKind) {
      senders = senders.filter((s) => s.track && s.track.kind === trackKind);
    }
    this._log("Unpublishing all tracks:", senders.length);

    // Create an offer for the updated state
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    for (const sender of senders) {
      if (sender.track) {
        try {
          const trackId = sender.track.id;
          const transceiver = this.peerConnection
            .getTransceivers()
            .find((t) => t.sender === sender);
          const mid = transceiver ? transceiver.mid : null;

          this._log("Unpublishing track:", { trackId, mid });

          if (!mid) {
            this._warn("No mid found for track:", trackId);
            continue;
          }

          // Stop the track first
          sender.track.stop();
          
        //   // Notify server
        //   await this._fetch(
        //     `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/unpublish`,
        //     {
        //       method: "POST",
        //       headers: { "Content-Type": "application/json" },
        //       body: JSON.stringify({
        //         trackName: trackId,
        //         mid: mid,
        //         force,
        //         sessionDescription: {
        //           type: offer.type,
        //           sdp: offer.sdp,
        //         },
        //       }),
        //     }
        //   );
        //  
        return new Promise(async (resolve, reject) => {
            await this.ws2unpublish(
                this.roomId, this.sessionId,
                trackId, mid, force,
                { type: offer.type ,sdp: offer.sdp},
                async (sessionDescription) => {
                    console.log("unpublish sessionId:", sessionDescription);
                    await this.peerConnection.setRemoteDescription(sessionDescription);
                    this._log("Unpublish => success. Applied SFU answer.");
                    
                }
            );
            this.peerConnection.removeTrack(sender);

            // Remove from our tracked set
            this.publishedTracks.delete(trackId);
  
            // Since we're unpublishing we need to stop local streams
            await this._cleanupEndedTracks();
  
            this._log(`Successfully unpublished track: ${trackId}`);
            resolve();
          }
        
    );
          // Remove from PeerConnection after server confirms
          
        } catch (error) {
          this._error(`Error unpublishing track:`, error);
        }
      }
    }
  }

  /**
   * Gets the session state
   * @async
   * @returns {Promise<Object>} The session state
   */
  async getSessionState() {
    if (!this.sessionId) {
      return this._warn("No active session");
    }

    try {
      return new Promise(async (resolve, reject) => {
        await this.ws2getSessionState(this.roomId, this.sessionId, (state) => {
          if (state.tracks) {
            this.trackStates = new Map(
              state.tracks.map((track) => [track.trackName, track.status])
            );
          }
          resolve(state);
        });
      });
      //   const response = await this._fetch(
      //     `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/state`
      //   );
      //   const state = await response.json();

      // Store track states internally
    } catch (error) {
      this._error("Error getting session state:", error);
      throw error;
    }
  }

  /**
   * Gets the track status
   * @async
   * @param {string} trackName - The track name
   * @returns {Promise<string>} The track status
   */
  async getTrackStatus(trackName) {
    const state = await this.getSessionState();
    return state.tracks.find((t) => t.trackName === trackName)?.status;
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


    //   const updateUrl = `${this.backendUrl}/api/rooms/${this.roomId}/sessions/${this.sessionId}/track-status`;
    //   const response = await this._fetch(updateUrl, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       trackId,
    //       kind,
    //       enabled,
    //       force: false, // Allow proper renegotiation
    //     }),
    //   });

    //   const result = await response.json();
    return new Promise(async(resolve, reject) => {
        await this.ws2updateTrackStatus(this.roomId, this.sessionId,  trackId,kind,enabled,force, async () => {
            if (response.errorCode) {
            throw new Error(
              response.errorDescription || "Unknown error updating track status"
            );
          }

          // Nếu cần đàm phán lại, xử lý quá trình renegotiation
          if (response.requiresImmediateRenegotiation) {
            await this._renegotiate();
          }

          if (!response.errorCode) {
            this._updateTrackState(trackId, enabled ? "enabled" : "disabled");
          }

          resolve(response);
            resolve();
          }); 
    });

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
      const error = new Error(response.errorDescription || "Unknown error");
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
        `${this.backendUrl}/api/users/${userId || "me"}`
      );
      return await response.json();
    } catch (error) {
      this._error("Error getting user info:", error);
      throw error;
    }
  }

  /**
   * Handles WebSocket messages
   * @private
   * @param {MessageEvent} event - The WebSocket message event
   * @returns {void}
   */
  _handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this._log("WebSocket message received:", message);

      // First, notify generic handlers
      this._wsMessageHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (err) {
          this._error("Error in WebSocket message handler:", err);
        }
      });

      // Then handle specific message types
      switch (message.type) {
        case "participant-joined":
          if (this._onParticipantJoinedCallback) {
            this._onParticipantJoinedCallback(message.payload);
          }
          break;

        case "participant-left":
          if (this._onParticipantLeftCallback) {
            this._onParticipantLeftCallback(message.payload.sessionId);
          }
          break;

        case "track-published":
          if (this._onRemoteTrackCallback) {
            // Handle track published event
            this._onRemoteTrackCallback(message.payload);
          }
          break;

        case "track-unpublished":
          if (this._onRemoteTrackUnpublishedCallback) {
            this._onRemoteTrackUnpublishedCallback(
              message.payload.sessionId,
              message.payload.trackName
            );
          }
          break;

        case "track-status-changed":
          if (this._onTrackStatusChangedCallback) {
            this._onTrackStatusChangedCallback(message.payload);
          }
          break;

        case "data-message":
          if (this._onDataMessageCallback) {
            this._onDataMessageCallback(message.payload);
          }
          break;

        case "room-metadata-updated":
          if (this._onRoomMetadataUpdatedCallback) {
            this._onRoomMetadataUpdatedCallback(message.payload);
          }
          break;

        default:
          this._log("Unhandled message type:", message.type);
      }
    } catch (error) {
      this._error("Error handling WebSocket message:", error);
    }
  }

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
    const resp = await this._fetch(`${this.backendUrl}/api/rooms`).then((r) =>
      r.json()
    );
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
      return this._warn("Not connected to any room");
    }

    return await this._fetch(
      `${this.backendUrl}/api/rooms/${this.roomId}/metadata`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    ).then((r) => r.json());
  }

  /**
   * Send a data message to all participants in the room via WebSocket.
   * @param {Object} data - The JSON object to send.
   * @returns {void}
   */
  async sendDataToAll(data) {
    if (!this.roomId || !this.sessionId) {
      throw new Error("Must be in a room to send data");
    }

    // Send via WebSocket instead of HTTP
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "data-message",
          payload: {
            from: this.sessionId,
            message: data,
          },
        })
      );
      console.log(
        JSON.stringify({
          type: "data-message",
          payload: {
            from: this.sessionId,
            message: data,
          },
        })
      );
    } else {
      throw new Error("WebSocket connection not available");
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
    if (typeof quality === "string") {
      const preset = CloudflareCalls.QUALITY_PRESETS[quality];
      if (!preset) {
        return this._warn(`Unknown quality preset: ${quality}`);
      }
      this.mediaQuality = quality;
      quality = preset;
    }

    this.mediaQuality = {
      video: { ...this.mediaQuality.video, ...quality.video },
      audio: { ...this.mediaQuality.audio, ...quality.audio },
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
      if (kind === "video") {
        const constraints = {
          width: qualitySettings.width,
          height: qualitySettings.height,
          frameRate: qualitySettings.frameRate,
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
    if (this.statsMonitoringState === "monitoring") return;

    this.statsMonitoringState = "monitoring";
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
    this.statsMonitoringState = "stopped";
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
      return this._warn("No active connection");
    }

    const stats = await this.peerConnection.getStats();
    const result = {
      outbound: {
        bitrate: 0,
        packetLoss: 0,
        qualityLimitation: "none",
      },
      inbound: {
        bitrate: 0,
        packetLoss: 0,
        jitter: 0,
      },
      connection: {
        roundTripTime: 0,
        state: this.peerConnection.connectionState,
      },
    };

    let outboundStats = null;
    let inboundStats = null;

    // Process each stat
    stats.forEach((stat) => {
      switch (stat.type) {
        case "outbound-rtp":
          if (stat.kind === "video") {
            outboundStats = stat;
            result.outbound.qualityLimitation = stat.qualityLimitationReason;
          }
          break;

        case "inbound-rtp":
          if (stat.kind === "video") {
            inboundStats = stat;
            result.inbound.jitter = stat.jitter;
            if (stat.packetsLost > 0) {
              result.inbound.packetLoss =
                (stat.packetsLost / (stat.packetsReceived + stat.packetsLost)) *
                100;
            }
          }
          break;

        case "candidate-pair":
          if (stat.state === "succeeded") {
            result.connection.roundTripTime = stat.currentRoundTripTime;
          }
          break;
      }
    });

    // Calculate bitrates using previous stats
    if (this.previousStats && outboundStats && inboundStats) {
      const timeDelta =
        (outboundStats.timestamp - this.previousStats.outboundTimestamp) / 1000; // Convert to seconds

      if (timeDelta > 0) {
        // Calculate outbound bitrate
        const bytesSentDelta =
          outboundStats.bytesSent - this.previousStats.bytesSent;
        result.outbound.bitrate = (bytesSentDelta * 8) / timeDelta; // Convert to bits per second

        // Calculate inbound bitrate
        const bytesReceivedDelta =
          inboundStats.bytesReceived - this.previousStats.bytesReceived;
        result.inbound.bitrate = (bytesReceivedDelta * 8) / timeDelta; // Convert to bits per second
      }
    }

    // Store current stats for next calculation
    if (outboundStats && inboundStats) {
      this.previousStats = {
        outboundTimestamp: outboundStats.timestamp,
        bytesSent: outboundStats.bytesSent,
        bytesReceived: inboundStats.bytesReceived,
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
        qualityLimitation: "none",
        bitrate: 0,
      });
    }

    stats.forEach((stat) => {
      if (stat.type === "outbound-rtp" && stat.kind === "video") {
        // Update local stream stats
        const localStats = streamStats.get(this.sessionId);
        if (localStats) {
          localStats.qualityLimitation = stat.qualityLimitationReason;
          localStats.bitrate = (stat.bytesSent * 8) / stat.timestamp;
        }
      } else if (stat.type === "inbound-rtp" && stat.kind === "video") {
        // Get sessionId from mid mapping
        const mid = stat.mid;
        const sessionId = this.midToSessionId.get(mid);

        if (sessionId) {
          streamStats.set(sessionId, {
            sessionId,
            packetLoss:
              stat.packetsLost > 0
                ? (stat.packetsLost /
                    (stat.packetsReceived + stat.packetsLost)) *
                  100
                : 0,
            qualityLimitation: "none",
            bitrate: (stat.bytesReceived * 8) / stat.timestamp,
          });
        }
      }
    });

    return streamStats;
  }

  // Add static QUALITY_PRESETS
  static QUALITY_PRESETS = {
    // 16:9 Presets
    high_16x9_xl: {
      // 1080p
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
        maxBitrate: 2_500_000,
      },
      audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 },
    },
    high_16x9_lg: {
      // 720p
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        maxBitrate: 1_500_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 2 },
    },
    high_16x9_md: {
      // 480p
      video: {
        width: { ideal: 854 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    high_16x9_sm: {
      // 360p
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 30 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    high_16x9_xs: {
      // 270p
      video: {
        width: { ideal: 480 },
        height: { ideal: 270 },
        frameRate: { ideal: 30 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },

    // 16:9 Medium Quality Presets (reduced framerate & bitrate)
    medium_16x9_xl: {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 24 },
        maxBitrate: 2_000_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 2 },
    },
    medium_16x9_lg: {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24 },
        maxBitrate: 1_200_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    medium_16x9_md: {
      video: {
        width: { ideal: 854 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    medium_16x9_sm: {
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 20 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_16x9_xs: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 270 },
        frameRate: { ideal: 20 },
        maxBitrate: 300_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },

    // 16:9 Low Quality Presets (minimum viable quality)
    low_16x9_xl: {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 15 },
        maxBitrate: 1_500_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    low_16x9_lg: {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    low_16x9_md: {
      video: {
        width: { ideal: 854 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 },
    },
    low_16x9_sm: {
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 12 },
        maxBitrate: 250_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 },
    },
    low_16x9_xs: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 270 },
        frameRate: { ideal: 10 },
        maxBitrate: 150_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },

    // 4:3 High Quality Presets (existing)
    high_4x3_xl: {
      // 960x720
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        maxBitrate: 1_500_000,
      },
      audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 },
    },
    high_4x3_lg: {
      // 640x480
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    high_4x3_md: {
      // 480x360
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 30 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 44100, channelCount: 1 },
    },
    high_4x3_sm: {
      // 320x240
      video: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 30 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    high_4x3_xs: {
      // 240x180 (perfect for 300x225 container)
      video: {
        width: { ideal: 240 },
        height: { ideal: 180 },
        frameRate: { ideal: 30 },
        maxBitrate: 250_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },

    // 4:3 Medium Quality Presets
    medium_4x3_xl: {
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 24 },
        maxBitrate: 1_200_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    medium_4x3_lg: {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    medium_4x3_md: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 20 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_4x3_sm: {
      video: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 20 },
        maxBitrate: 300_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_4x3_xs: {
      video: {
        width: { ideal: 240 },
        height: { ideal: 180 },
        frameRate: { ideal: 20 },
        maxBitrate: 200_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },

    // 4:3 Low Quality Presets
    low_4x3_xl: {
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    low_4x3_lg: {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 },
    },
    low_4x3_md: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 12 },
        maxBitrate: 250_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 },
    },
    low_4x3_sm: {
      video: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 10 },
        maxBitrate: 150_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },
    low_4x3_xs: {
      video: {
        width: { ideal: 240 },
        height: { ideal: 180 },
        frameRate: { ideal: 10 },
        maxBitrate: 100_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },

    // 1:1 High Quality Presets
    high_1x1_xl: {
      // 720x720
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        maxBitrate: 1_500_000,
      },
      audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 },
    },
    high_1x1_lg: {
      // 480x480
      video: {
        width: { ideal: 480 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    high_1x1_md: {
      // 360x360
      video: {
        width: { ideal: 360 },
        height: { ideal: 360 },
        frameRate: { ideal: 30 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 44100, channelCount: 1 },
    },
    high_1x1_sm: {
      // 240x240
      video: {
        width: { ideal: 240 },
        height: { ideal: 240 },
        frameRate: { ideal: 30 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    high_1x1_xs: {
      // 180x180
      video: {
        width: { ideal: 180 },
        height: { ideal: 180 },
        frameRate: { ideal: 30 },
        maxBitrate: 250_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },

    // 1:1 Medium Quality Presets
    medium_1x1_xl: {
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
        frameRate: { ideal: 24 },
        maxBitrate: 1_200_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    medium_1x1_lg: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    medium_1x1_md: {
      video: {
        width: { ideal: 360 },
        height: { ideal: 360 },
        frameRate: { ideal: 20 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_1x1_sm: {
      video: {
        width: { ideal: 240 },
        height: { ideal: 240 },
        frameRate: { ideal: 20 },
        maxBitrate: 300_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_1x1_xs: {
      video: {
        width: { ideal: 180 },
        height: { ideal: 180 },
        frameRate: { ideal: 20 },
        maxBitrate: 200_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },

    // 1:1 Low Quality Presets
    low_1x1_xl: {
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    low_1x1_lg: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 },
    },
    low_1x1_md: {
      video: {
        width: { ideal: 360 },
        height: { ideal: 360 },
        frameRate: { ideal: 12 },
        maxBitrate: 250_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 },
    },
    low_1x1_sm: {
      video: {
        width: { ideal: 240 },
        height: { ideal: 240 },
        frameRate: { ideal: 10 },
        maxBitrate: 150_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },
    low_1x1_xs: {
      video: {
        width: { ideal: 180 },
        height: { ideal: 180 },
        frameRate: { ideal: 10 },
        maxBitrate: 100_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },

    // 9:16 High Quality Presets (Portrait/Mobile)
    high_9x16_xl: {
      // 1080x1920
      video: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        frameRate: { ideal: 30 },
        maxBitrate: 2_500_000,
      },
      audio: { maxBitrate: 128000, sampleRate: 48000, channelCount: 2 },
    },
    high_9x16_lg: {
      // 720x1280
      video: {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 30 },
        maxBitrate: 1_500_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    high_9x16_md: {
      // 480x854
      video: {
        width: { ideal: 480 },
        height: { ideal: 854 },
        frameRate: { ideal: 30 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 44100, channelCount: 1 },
    },
    high_9x16_sm: {
      // 360x640
      video: {
        width: { ideal: 360 },
        height: { ideal: 640 },
        frameRate: { ideal: 30 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    high_9x16_xs: {
      // 270x480
      video: {
        width: { ideal: 270 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },

    // 9:16 Medium Quality Presets
    medium_9x16_xl: {
      video: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        frameRate: { ideal: 24 },
        maxBitrate: 2_000_000,
      },
      audio: { maxBitrate: 96000, sampleRate: 48000, channelCount: 1 },
    },
    medium_9x16_lg: {
      video: {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 24 },
        maxBitrate: 1_200_000,
      },
      audio: { maxBitrate: 64000, sampleRate: 44100, channelCount: 1 },
    },
    medium_9x16_md: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 854 },
        frameRate: { ideal: 20 },
        maxBitrate: 600_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_9x16_sm: {
      video: {
        width: { ideal: 360 },
        height: { ideal: 640 },
        frameRate: { ideal: 20 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    medium_9x16_xs: {
      video: {
        width: { ideal: 270 },
        height: { ideal: 480 },
        frameRate: { ideal: 20 },
        maxBitrate: 300_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },

    // 9:16 Low Quality Presets
    low_9x16_xl: {
      video: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        frameRate: { ideal: 15 },
        maxBitrate: 1_500_000,
      },
      audio: { maxBitrate: 48000, sampleRate: 44100, channelCount: 1 },
    },
    low_9x16_lg: {
      video: {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 15 },
        maxBitrate: 800_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 44100, channelCount: 1 },
    },
    low_9x16_md: {
      video: {
        width: { ideal: 480 },
        height: { ideal: 854 },
        frameRate: { ideal: 12 },
        maxBitrate: 400_000,
      },
      audio: { maxBitrate: 32000, sampleRate: 22050, channelCount: 1 },
    },
    low_9x16_sm: {
      video: {
        width: { ideal: 360 },
        height: { ideal: 640 },
        frameRate: { ideal: 10 },
        maxBitrate: 250_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },
    low_9x16_xs: {
      video: {
        width: { ideal: 270 },
        height: { ideal: 480 },
        frameRate: { ideal: 10 },
        maxBitrate: 150_000,
      },
      audio: { maxBitrate: 24000, sampleRate: 22050, channelCount: 1 },
    },
  };
}

export default CloudflareCalls;
