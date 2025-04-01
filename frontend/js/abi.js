export const CONTRACT_ABI= [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "sender",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "eventData",
				"type": "bytes"
			}
		],
		"name": "EventForwardedToBackend",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "participant",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "eventData",
				"type": "bytes"
			}
		],
		"name": "EventForwardedToFrontend",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "participant",
				"type": "address"
			},
			{
				"components": [
					{
						"internalType": "string",
						"name": "trackName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "mid",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "location",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "isPublished",
						"type": "bool"
					},
					{
						"internalType": "string",
						"name": "sessionId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "roomId",
						"type": "string"
					}
				],
				"indexed": false,
				"internalType": "struct DAppMeeting.Track[]",
				"name": "initialTracks",
				"type": "tuple[]"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "sessionDescription",
				"type": "bytes"
			}
		],
		"name": "ParticipantJoined",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "participant",
				"type": "address"
			}
		],
		"name": "ParticipantLeft",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "participant",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "trackName",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "sessionId",
				"type": "string"
			}
		],
		"name": "TrackAdded",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_backend",
				"type": "address"
			}
		],
		"name": "addAuthorizedBackend",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "_participant",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "_sessionId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_trackName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_mid",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_location",
				"type": "string"
			},
			{
				"internalType": "bool",
				"name": "_isPublished",
				"type": "bool"
			}
		],
		"name": "addNewTrackAfterPublish",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"components": [
					{
						"internalType": "string",
						"name": "trackName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "mid",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "location",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "isPublished",
						"type": "bool"
					},
					{
						"internalType": "string",
						"name": "sessionId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "roomId",
						"type": "string"
					}
				],
				"internalType": "struct DAppMeeting.Track",
				"name": "_newTrack",
				"type": "tuple"
			}
		],
		"name": "addTrack",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "authorizedBackends",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			}
		],
		"name": "createRoom",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "bytes",
				"name": "_eventData",
				"type": "bytes"
			}
		],
		"name": "forwardEventToBackend",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "_participant",
				"type": "address"
			},
			{
				"internalType": "bytes",
				"name": "_eventData",
				"type": "bytes"
			}
		],
		"name": "forwardEventToFrontend",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			}
		],
		"name": "getParticipantInfo",
		"outputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "walletAddress",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "name",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "sessionID",
						"type": "string"
					}
				],
				"internalType": "struct DAppMeeting.Participant",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "_participant",
				"type": "address"
			}
		],
		"name": "getParticipantTracks",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "trackName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "mid",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "location",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "isPublished",
						"type": "bool"
					},
					{
						"internalType": "string",
						"name": "sessionId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "roomId",
						"type": "string"
					}
				],
				"internalType": "struct DAppMeeting.Track[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "_participant",
				"type": "address"
			}
		],
		"name": "getParticipantTracksCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			}
		],
		"name": "getRoomParticipantsCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			}
		],
		"name": "getRoomParticipantsDetails",
		"outputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "walletAddress",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "name",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "sessionID",
						"type": "string"
					},
					{
						"components": [
							{
								"internalType": "string",
								"name": "trackName",
								"type": "string"
							},
							{
								"internalType": "string",
								"name": "mid",
								"type": "string"
							},
							{
								"internalType": "string",
								"name": "location",
								"type": "string"
							},
							{
								"internalType": "bool",
								"name": "isPublished",
								"type": "bool"
							},
							{
								"internalType": "string",
								"name": "sessionId",
								"type": "string"
							},
							{
								"internalType": "string",
								"name": "roomId",
								"type": "string"
							}
						],
						"internalType": "struct DAppMeeting.Track[]",
						"name": "tracks",
						"type": "tuple[]"
					}
				],
				"internalType": "struct DAppMeeting.ParticipantDetails[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_name",
				"type": "string"
			},
			{
				"components": [
					{
						"internalType": "string",
						"name": "trackName",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "mid",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "location",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "isPublished",
						"type": "bool"
					},
					{
						"internalType": "string",
						"name": "sessionId",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "roomId",
						"type": "string"
					}
				],
				"internalType": "struct DAppMeeting.Track[]",
				"name": "_initialTracks",
				"type": "tuple[]"
			},
			{
				"internalType": "bytes",
				"name": "sessionDescription",
				"type": "bytes"
			}
		],
		"name": "joinRoom",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			}
		],
		"name": "leaveRoom",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "participantIndices",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "participantTrackCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "participantTracks",
		"outputs": [
			{
				"internalType": "string",
				"name": "trackName",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "mid",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "location",
				"type": "string"
			},
			{
				"internalType": "bool",
				"name": "isPublished",
				"type": "bool"
			},
			{
				"internalType": "string",
				"name": "sessionId",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "participantsInRoom",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_backend",
				"type": "address"
			}
		],
		"name": "removeAuthorizedBackend",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"name": "rooms",
		"outputs": [
			{
				"internalType": "string",
				"name": "roomId",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "creationTime",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_roomId",
				"type": "string"
			},
			{
				"internalType": "address",
				"name": "_participantAddress",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "_sessionID",
				"type": "string"
			}
		],
		"name": "setParticipantSessionID",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]