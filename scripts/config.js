export const CONFIG = {
    name: 'simple-loot-sheet-fvtt',
    ns: 'simplelootsheet',

    socket: 'module.simple-loot-sheet-fvtt',
    messageTypes: {
        CLAIM_REQUEST: 'claim-request',
    },

    userRoles: [
        undefined,
        'Player',
        'Trusted Player',
        'Assistant GM',
        'Game Master',
    ],

    claimsKey: 'claims',
    needKey: 'need',
    greedKey: 'greed',
    passKey: 'pass',

    claimedByKey: 'claimed-by',
};
