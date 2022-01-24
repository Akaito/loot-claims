export const MODULE_CONFIG = {
    name: 'simple-loot-sheet-fvtt',

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

    lootedByKey: 'looted-by',
    lootedFromKey: 'looted-from',
    lootedFromNameKey: 'looted-from-name',
};
