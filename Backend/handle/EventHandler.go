package handle

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/json"
	"fmt"
	"log"

	contract "dappmeetingnew/constract"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

// EventHandler handles events from smart contract and orchestrates backend responses
type EventHandler struct {
	contractInstance  *contract.Contract
	cloudflareService *CloudflareService
	smCallManager     *SMCallManager
}

// NewEventHandler creates a new event handler
func NewEventHandler(contractInstance *contract.Contract, cloudflareService *CloudflareService, smCallManager *SMCallManager) *EventHandler {
	return &EventHandler{
		contractInstance:  contractInstance,
		cloudflareService: cloudflareService,
		smCallManager:     smCallManager,
	}
}

// HandleParticipantJoined processes ParticipantJoined events
func (h *EventHandler) HandleParticipantJoined(event *contract.ContractParticipantJoined) {
	log.Printf("Participant Joined - Room: %s, Address: %s, Tracks: %d",
		event.RoomId, event.Participant.Hex(), len(event.InitialTracks))

	// Convert contract tracks to a format Cloudflare can use
	tracks := make([]interface{}, len(event.InitialTracks))
	for i, track := range event.InitialTracks {
		tracks[i] = map[string]interface{}{
			"trackName":   track.TrackName,
			"mid":         track.Mid,
			"location":    track.Location,
			"isPublished": track.IsPublished,
		}
	}

	// Process with Cloudflare service - this will create a session and publish tracks
	sessionID, cloudflareResponse, err := h.cloudflareService.HandleParticipantEvent(
		event.RoomId,
		event.Participant.Hex(),
		tracks,
		event.SessionDescription,
	)

	if err != nil {
		log.Printf("Error processing participant event: %v", err)
		return
	}

	// Update participant's session ID in the smart contract via our queue
	_, err = h.smCallManager.SetParticipantSessionID(event.RoomId, event.Participant, sessionID)
	if err != nil {
		log.Printf("Error setting participant session ID: %v", err)
		return
	}

	// Prepare event data to send back to frontend
	eventData := map[string]interface{}{
		"sessionID":          sessionID,
		"type":               "join-room",
		"cloudflareResponse": cloudflareResponse,
	}

	eventDataBytes, err := json.Marshal(eventData)
	if err != nil {
		log.Printf("Error marshaling event data: %v", err)
		return
	}

	// Forward event to frontend through smart contract via our queue
	txHash, err := h.smCallManager.ForwardEventToFrontend(event.RoomId, event.Participant, eventDataBytes)
	if err != nil {
		log.Printf("Error forwarding event to frontend: %v", err)
		return
	}

	log.Printf("Successfully processed join event for %s, txHash: %s", event.Participant.Hex(), txHash)
}

// HandleParticipantLeft processes ParticipantLeft events
func (h *EventHandler) HandleParticipantLeft(event *contract.ContractParticipantLeft) {
	log.Printf("Participant Left - Room: %s, Address: %s",
		event.RoomId, event.Participant.Hex())

	// Additional logic can be added here if needed
}

// HandleTrackAdded processes TrackAdded events
func (h *EventHandler) HandleTrackAdded(event *contract.ContractTrackAdded) {
	log.Printf("Track Added - Room: %s, Participant: %s, Track Name: %s",
		event.RoomId, event.Participant.Hex(), event.TrackName)

	// Additional logic can be added here if needed for track handling
}

// HandleEventToBackend processes EventForwardedToBackend events
func (h *EventHandler) HandleEventToBackend(event *contract.ContractEventForwardedToBackend) {
	log.Printf("Event To Backend - Room: %s, Sender: %s",
		event.RoomId, event.Sender.Hex())

	// Parse the event data to determine action
	var eventData map[string]interface{}
	if err := json.Unmarshal(event.EventData, &eventData); err != nil {
		log.Printf("Error parsing event data: %v", err)
		return
	}

	// Check event type and handle accordingly
	if eventType, ok := eventData["type"].(string); ok {
		switch eventType {
		case "publish-track":
			h.handlePublishTrack(event.RoomId, event.Sender, eventData)
		case "pull-track":
			h.handlePullTrack(event.RoomId, event.Sender, eventData)
		case "close-track":
			h.handleCloseTrack(event.RoomId, event.Sender, eventData)
		case "renegotiation":
			h.handleRenegotiation(event.RoomId, event.Sender, eventData)
		default:
			log.Printf("Unknown event type: %s", eventType)
		}
	}
}

// Helper methods for specific event types
// handlePublishTrack processes publish track events from smart contract
func (h *EventHandler) handlePublishTrack(roomID string, sender common.Address, eventData map[string]interface{}) {
	log.Printf("Handling publish track event for room %s and participant %s", roomID, sender.Hex())

	// Check if a sessionID was already provided
	var sessionID string
	var err error

	// Create a new session
	sessionID, err = h.cloudflareService.CreateSession()
	if err != nil {
		log.Printf("Error creating session: %v", err)
		return
	}
	log.Printf("Created new session ID: %s", sessionID)

	// Extract compressed data if available
	var compressedData string
	if cd, ok := eventData["compressedData"].(string); ok {
		compressedData = cd
	}

	var offer map[string]interface{}
	var tracks []map[string]interface{}

	// If we have compressed data, decompress and parse it
	if compressedData != "" {
		decompressed, err := h.cloudflareService.decompressData([]byte(compressedData))
		if err != nil {
			log.Printf("Error decompressing track data: %v", err)
			return
		}

		log.Printf("Decompressed track data: %s", decompressed)

		// Parse decompressed data
		var trackData struct {
			Offer  map[string]interface{}   `json:"offer"`
			Tracks []map[string]interface{} `json:"tracks"`
		}

		if err := json.Unmarshal([]byte(decompressed), &trackData); err != nil {
			log.Printf("Error parsing decompressed track data: %v", err)
			return
		}

		offer = trackData.Offer
		tracks = trackData.Tracks
	} else {
		// Try to extract offer and tracks directly from event data
		if o, ok := eventData["offer"].(map[string]interface{}); ok {
			offer = o
		} else {
			log.Printf("Missing or invalid offer in publish-track event")
			return
		}

		if t, ok := eventData["tracks"].([]interface{}); ok {
			// Convert tracks to the required format
			tracks = make([]map[string]interface{}, len(t))
			for i, track := range t {
				if trackMap, ok := track.(map[string]interface{}); ok {
					tracks[i] = map[string]interface{}{
						"trackName": trackMap["trackName"],
						"mid":       trackMap["mid"],
						"location":  trackMap["location"],
					}
				} else {
					log.Printf("Invalid track format at index %d", i)
				}
			}
		} else {
			log.Printf("Missing or invalid tracks in publish-track event")
			return
		}
	}

	// Ensure tracks are properly formatted for Cloudflare API
	formattedTracks := make([]map[string]interface{}, len(tracks))
	for i, track := range tracks {
		formattedTracks[i] = map[string]interface{}{
			"trackName": track["trackName"],
			"mid":       track["mid"],
			"location":  track["location"],
		}
	}

	log.Printf("Calling Cloudflare to publish tracks with sessionID: %s", sessionID)
	log.Printf("Tracks to publish: %+v", formattedTracks)

	// Call Cloudflare to publish tracks
	response, err := h.cloudflareService.PublishTracks(sessionID, offer, formattedTracks)
	if err != nil {
		log.Printf("Error publishing tracks: %v", err)
		return
	}

	// Send response back to frontend
	responseData := map[string]interface{}{
		"type": "publish-track-response",
		"cloudflareResponse": map[string]interface{}{
			"sessionDescription": response["sessionDescription"],
			"tracks":             response["tracks"],
			"txHash":             response["txHash"],
		},
	}

	responseBytes, err := json.Marshal(responseData)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		return
	}

	// Forward the response to the frontend
	txHash, err := h.smCallManager.ForwardEventToFrontend(roomID, sender, responseBytes)
	if err != nil {
		log.Printf("Error forwarding response to frontend: %v", err)
		return
	}

	// Log the successful response with the actual transaction hash
	log.Printf("Successfully handled publish-track event for %s, txHash: %s", sender.Hex(), txHash)

	// Update session ID in the smart contract
	_, err = h.smCallManager.SetParticipantSessionID(roomID, sender, sessionID)
	if err != nil {
		log.Printf("Error updating session ID in contract: %v", err)
		// Continue anyway as we need to send response back to frontend
	}

	// Process Cloudflare response and update smart contract with the track information
	if cloudflareTracks, ok := response["tracks"].([]interface{}); ok && len(cloudflareTracks) > 0 {
		log.Printf("Received Cloudflare tracks: %+v", cloudflareTracks)

		// For each track returned from Cloudflare, update the smart contract
		for _, cfTrack := range cloudflareTracks {
			if track, ok := cfTrack.(map[string]interface{}); ok {
				var mid, trackName string

				// Extract mid and trackName from the track
				if midVal, ok := track["mid"].(string); ok {
					mid = midVal
				}

				if nameVal, ok := track["trackName"].(string); ok {
					trackName = nameVal
				}

				if mid != "" && trackName != "" {
					// Call the smart contract function to add the track
					log.Printf("Adding track to smart contract - Room: %s, Participant: %s, TrackName: %s, Mid: %s",
						roomID, sender.Hex(), trackName, mid)

					// Use the addNewTrackAfterPublish function to update track info on the contract
					location := "local" // Default location value
					isPublished := true // Default isPublished value

					txHash, err := h.smCallManager.AddNewTrackAfterPublish(
						roomID,
						sender,
						sessionID,
						trackName,
						mid,
						location,
						isPublished,
					)

					if err != nil {
						log.Printf("Error adding track to smart contract: %v", err)
					} else {
						log.Printf("Successfully added track to smart contract, txHash: %s", txHash)
					}
				}
			}
		}
	}
}

// handlePullTrack processes pull track events from smart contract
func (h *EventHandler) handlePullTrack(roomID string, sender common.Address, eventData map[string]interface{}) {
	log.Printf("[Smart Contract Event] Received track pull event for room %s from %s",
		roomID, sender.Hex())

	// Extract session ID, remote session ID and track name from eventData
	var sessionID, remoteSessionID, trackName string
	if compressedData, ok := eventData["compressedData"].(string); ok && compressedData != "" {
		// Decompress data
		decompressed, err := h.cloudflareService.decompressData([]byte(compressedData))
		if err != nil {
			log.Printf("[Error] Failed to decompress pull track data: %v", err)
			return
		}

		// Parse decompressed data
		var pullData struct {
			SessionId       string `json:"sessionId"`
			RemoteSessionId string `json:"remoteSessionId"`
			TrackName       string `json:"trackName"`
		}
		if err := json.Unmarshal([]byte(decompressed), &pullData); err != nil {
			log.Printf("[Error] Failed to parse pull data: %v", err)
			return
		}

		sessionID = pullData.SessionId
		remoteSessionID = pullData.RemoteSessionId
		trackName = pullData.TrackName
	} else {
		// Extract data directly from eventData
		if sid, ok := eventData["sessionId"].(string); !ok {
			log.Printf("[Error] Missing sessionId in pull track event")
			return
		} else {
			sessionID = sid
		}
		if rsid, ok := eventData["remoteSessionId"].(string); !ok {
			log.Printf("[Error] Missing remoteSessionId in pull track event")
			return
		} else {
			remoteSessionID = rsid
		}
		if tn, ok := eventData["trackName"].(string); !ok {
			log.Printf("[Error] Missing trackName in pull track event")
			return
		} else {
			trackName = tn
		}
	}

	log.Printf("[Pull Request] Session %s requesting to pull track %s from session %s",
		sessionID, trackName, remoteSessionID)

	// Prepare pull request for Cloudflare
	tracks := []map[string]interface{}{
		{
			"trackName": trackName,
			"location":  "remote",
			"sessionId": remoteSessionID,
		},
	}

	// Call Cloudflare service to pull tracks
	response, err := h.cloudflareService.PullTracks(sessionID, tracks)
	if err != nil {
		log.Printf("[Error] Failed to pull tracks: %v", err)
		errorResponse := map[string]interface{}{
			"type":             "pull-track-response",
			"errorCode":        500,
			"errorDescription": fmt.Sprintf("Failed to pull track: %v", err),
		}

		responseBytes, _ := json.Marshal(errorResponse)
		// Compress error response
		var compressed bytes.Buffer
		w := zlib.NewWriter(&compressed)
		w.Write(responseBytes)
		w.Close()

		// Send error response back to frontend
		_, err = h.smCallManager.ForwardEventToFrontend(roomID, sender, compressed.Bytes())
		if err != nil {
			log.Printf("[Error] Failed to send error response: %v", err)
		}
		return
	}

	// Check if response contains session description for renegotiation
	responseData := map[string]interface{}{
		"type":                           "pull-track-response",
		"sessionId":                      sessionID,
		"requiresImmediateRenegotiation": false,
	}

	if sdp, ok := response["sessionDescription"].(map[string]interface{}); ok {
		responseData["requiresImmediateRenegotiation"] = true
		responseData["sessionDescription"] = sdp
	}

	// Send success response back to frontend
	responseBytes, err := json.Marshal(responseData)
	if err != nil {
		log.Printf("[Error] Failed to marshal response: %v", err)
		return
	}

	// Compress response
	var compressed bytes.Buffer
	w := zlib.NewWriter(&compressed)
	w.Write(responseBytes)
	w.Close()

	// Send response to frontend
	_, err = h.smCallManager.ForwardEventToFrontend(roomID, sender, compressed.Bytes())
	if err != nil {
		log.Printf("[Error] Failed to send success response: %v", err)
		return
	}

	log.Printf("[Success] Successfully pulled track %s from session %s for session %s",
		trackName, remoteSessionID, sessionID)
}

// handleCloseTrack processes close track events from smart contract
func (h *EventHandler) handleCloseTrack(roomID string, sender common.Address, eventData map[string]interface{}) {
	// Implementation for closing tracks
	sessionID, ok := eventData["sessionID"].(string)
	if !ok {
		log.Printf("Missing sessionID in close-track event")
		return
	}

	trackData, ok := eventData["tracks"].([]interface{})
	if !ok {
		log.Printf("Missing or invalid tracks in close-track event")
		return
	}

	// Convert tracks to the required format
	tracks := make([]map[string]string, len(trackData))
	for i, t := range trackData {
		if trackMap, ok := t.(map[string]interface{}); ok {
			stringMap := make(map[string]string)
			for k, v := range trackMap {
				if strVal, ok := v.(string); ok {
					stringMap[k] = strVal
				}
			}
			tracks[i] = stringMap
		}
	}

	force := false
	if forceVal, ok := eventData["force"].(bool); ok {
		force = forceVal
	}

	var sessionDescription map[string]interface{}
	if sd, ok := eventData["sessionDescription"].(map[string]interface{}); ok {
		sessionDescription = sd
	}

	// Call Cloudflare to close tracks
	response, err := h.cloudflareService.CloseTracks(sessionID, tracks, force, sessionDescription)
	if err != nil {
		log.Printf("Error closing tracks: %v", err)
		return
	}

	// Send response back to frontend
	responseData := map[string]interface{}{
		"type":               "close-track-response",
		"cloudflareResponse": response,
	}

	responseBytes, err := json.Marshal(responseData)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		return
	}

	// Forward the response to the frontend via our queue
	_, err = h.smCallManager.ForwardEventToFrontend(roomID, sender, responseBytes)
	if err != nil {
		log.Printf("Error forwarding response to frontend: %v", err)
	}
}

// handleRenegotiation processes renegotiation requests
func (h *EventHandler) handleRenegotiation(roomID string, sender common.Address, eventData map[string]interface{}) {
	log.Printf("Handling renegotiation for room %s from participant %s", roomID, sender.Hex())

	var sessionID string
	var sessionDescription map[string]interface{}

	// Check for compressed data format first
	if compressedData, ok := eventData["compressedData"].(string); ok && compressedData != "" {
		// Decompress the data
		decompressed, err := h.cloudflareService.decompressData([]byte(compressedData))
		if err != nil {
			log.Printf("Error decompressing renegotiation data: %v", err)
			return
		}

		// Parse decompressed data
		var renegotiationData struct {
			SessionId          string                 `json:"sessionId"`
			SessionDescription map[string]interface{} `json:"sessionDescription"`
		}

		if err := json.Unmarshal([]byte(decompressed), &renegotiationData); err != nil {
			log.Printf("Error parsing decompressed renegotiation data: %v", err)
			return
		}

		sessionID = renegotiationData.SessionId
		sessionDescription = renegotiationData.SessionDescription
	} else {
		// Extract data directly if not compressed
		if sid, ok := eventData["sessionId"].(string); ok {
			sessionID = sid
		} else {
			log.Printf("Missing sessionId in renegotiation event")
			return
		}

		if sd, ok := eventData["sessionDescription"].(map[string]interface{}); ok {
			sessionDescription = sd
		} else {
			log.Printf("Missing or invalid sessionDescription in renegotiation event")
			return
		}
	}

	// Call Cloudflare to renegotiate
	response, err := h.cloudflareService.Renegotiate(sessionID, sessionDescription)
	if err != nil {
		log.Printf("Error during renegotiation: %v", err)

		// Create error response
		errorResponse := map[string]interface{}{
			"type":             "renegotiation-response",
			"errorCode":        500,
			"errorDescription": fmt.Sprintf("Failed to renegotiate: %v", err),
		}

		responseBytes, err := json.Marshal(errorResponse)
		if err != nil {
			log.Printf("Error marshaling error response: %v", err)
			return
		}

		// Forward error response to the frontend
		_, err = h.smCallManager.ForwardEventToFrontend(roomID, sender, responseBytes)
		if err != nil {
			log.Printf("Error forwarding error response to frontend: %v", err)
		}
		return
	}

	// Send success response back to frontend
	responseData := map[string]interface{}{
		"type":               "renegotiation-response",
		"sessionId":          sessionID,
		"sessionDescription": response["sessionDescription"],
	}

	responseBytes, err := json.Marshal(responseData)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		return
	}

	// Forward the response to the frontend
	_, err = h.smCallManager.ForwardEventToFrontend(roomID, sender, responseBytes)
	if err != nil {
		log.Printf("Error forwarding response to frontend: %v", err)
	}
}

// GetParticipantTracks retrieves all tracks for a participant
func (h *EventHandler) GetParticipantTracks(roomID string, participant common.Address) ([]contract.DAppMeetingTrack, error) {
	opts := &bind.CallOpts{Context: context.Background()}
	return h.contractInstance.GetParticipantTracks(opts, roomID, participant)
}
