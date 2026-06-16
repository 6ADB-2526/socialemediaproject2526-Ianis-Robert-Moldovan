/** @format */

// =============================================================================
// state.js — DE centrale opslagplaats voor de huidige toestand van de app.
// Eén groot object 'state' dat alle modules importeren en lezen/schrijven.
// Zo weet de hele frontend "wat er nu aan de hand is" (wie is ingelogd, welke
// chat is open, welke berichten, enz.). Dit is het gedeelde geheugen.
// =============================================================================

export const state = {
  user: null,              // de ingelogde gebruiker
  friends: [],             // lijst van vrienden
  groups: [],              // lijst van groepen
  incomingRequests: [],    // ontvangen vriendschapsverzoeken
  outgoingRequests: [],    // verstuurde verzoeken
  blockedUsers: [],        // geblokkeerde gebruikers
  stories: [],             // stories van jou + vrienden
  selectedFriend: null,    // welke 1-op-1 chat is open (of null)
  selectedGroup: null,     // welke groep is open (of null)
  messages: [],            // berichten van de open chat
  socket: null,            // de Socket.IO-verbinding

  // Timers (om later te kunnen stoppen/resetten)
  typingTimer: null,
  searchTimer: null,
  relativeTimer: null,

  // Voice recording (toestand tijdens het opnemen van een spraakbericht)
  mediaRecorder: null,
  voiceStream: null,
  voiceChunks: [],
  voiceTimer: null,
  voiceMaxSeconds: 60,        // opname stopt automatisch na 60s
  recordingFriendId: null,
  recordingGroupId: null,
  recordingStartedAt: 0,

  // Camera (de actieve videostream)
  cameraStream: null,

  // Server-config (o.a. ICE-servers voor bellen) met veilige standaardwaarden
  config: {
    ice_servers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  },

  // Actief gesprek (bel-toestand)
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

// Zet de bel-toestand terug naar leeg (na het ophangen).
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
