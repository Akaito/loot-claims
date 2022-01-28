import { reset } from './module-lootClaims.js';
import { findLootTable } from './SimpleLootSheet.js';

export const MODULE_CONFIG = {
    name: 'simple-loot-sheet-fvtt',
    nameHuman: 'Simple Loot Sheet',

    excludedItemTypes: ['class', 'spell', 'feat'],

    functions: {
        findLootTable,
        reset,
    },

    socket: 'module.simple-loot-sheet-fvtt',
    messageTypes: {
        CLAIM_REQUEST: 'claim-request',
    },

    /// In order of descending priority.
    claimTypes: [
        'need',
        'greed',
        'pass',
    ],

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

    lootedByKey: 'lootedBy',
    lootedFromKey: 'looted-from-uuid',
    lootedFromNameKey: 'looted-from-name',

    generatedFromKey: 'generated-from',
    hiddenKey: 'hidden',
};
