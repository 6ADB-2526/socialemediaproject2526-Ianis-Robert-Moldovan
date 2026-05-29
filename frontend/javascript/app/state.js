/** @format */

/**
 * Central application state.
 * All modules import and mutate this single object.
 */
export const state = {
  user: null,
  friends: [],
  groups: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  stories: [],
  selectedFriend: null,
  selectedGroup: null,
  messages: [],
  socket: null,

  // Timers
  typingTimer: null,
  searchTimer: null,
  relativeTimer: null,

  // Voice recording
  mediaRecorder: null,
  voiceStream: null,
  voiceChunks: [],
  voiceTimer: null,
  voiceMaxSeconds: 60,
  recordingFriendId: null,
  recordingGroupId: null,
  recordingStartedAt: 0,

  // Camera
  cameraStream: null,

  // Server config
  config: {
    ice_servers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  },

  // Active call
  call: {
    active: false,
    peer: null,
    localStream: null,
    remoteStream: null,
    friendId: null,
    type: "voice",
    isCaller: false,
    caller: null,
    ringTimer: null,
    muted: false,
    cameraEnabled: false,
    pendingCandidates: [],
  },
};

export function resetCall() {
  state.call = {
    active: false,
    peer: null,
    localStream: null,
    remoteStream: null,
    friendId: null,
    type: "voice",
    isCaller: false,
    caller: null,
    ringTimer: null,
    muted: false,
    cameraEnabled: false,
    pendingCandidates: [],
  };
}
