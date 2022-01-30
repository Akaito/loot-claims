import { reset } from './module-lootClaims.js';
import { findLootTable } from './SimpleLootSheet.js';

export const MODULE_CONFIG = {
    name: 'loot-claims',
    title: 'Loot Claims',
    socket: 'module.loot-claims',

    // Used to prefix logs so we can spot ours easily.
    emoji: '\u{1F4B0}',
    logPrefix:  '\u{1F4B0} loot-claims | ',

    excludedItemTypes: ['class', 'spell', 'feat'],

    functions: {
        findLootTable,
        reset,
    },

    messageTypes: {
        CLAIM_REQUEST: 'claim-request',
    },

    /// In order of descending priority.  Also relevant to getFlag().
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

    /////
    // getFlag() / setFlag() stuff.
    /// Object with owned item uuids as keys to getData()'s output.
    claimsKey: 'claims',
    //needKey: 'need',
    //greedKey: 'greed',
    //passKey: 'pass',

    lootedByKey: 'lootedBy',
    lootedFromKey: 'looted-from-uuid',
    lootedFromNameKey: 'looted-from-name',

    generatedFromKey: 'generated-from',
    hiddenKey: 'hidden',
};
