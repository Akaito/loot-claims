import { reset } from './module-lootClaims.js';
import { findLootTable } from './ActorSheet_dnd5e.js';
import { changeSheet } from './util-lootClaims.js';

export const MODULE_CONFIG = {
    name: 'loot-claims',
    title: 'Loot Claims',
    socket: 'module.loot-claims',

    // Used to prefix logs so we can spot ours easily.
    emoji: '\u{1F4B0}',
    logPrefix:  '\u{1F4B0} loot-claims | ',

    excludedItemTypes: ['class', 'spell', 'feat'],

    functions: {
        changeSheet,
        findLootTable,
        reset,
    },

    //prng: null, // Becomes a Foundry MersenneTwister during module init.

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

    /// Caution: If this has too small a range relative to the number of claimants
    /// for any given item, you can get a loop of attempts to create a non-tied roll.
    rollMaxValue: 100,
    //rollFormula: '1d100',

    /////
    // getFlag() / setFlag() stuff.
    /// Object with owned item uuids as keys to getData()'s output.
    claimsKey: 'claims',
    //needKey: 'need',
    //greedKey: 'greed',
    //passKey: 'pass',

    currencyLootedKey: 'currency-looted',
    currencyPseudoItemsKey: 'currency-pseudo-items',
    currencyClaimsKey: 'currency-claims',
    lootedByKey: 'lootedBy',
    lootedFromKey: 'looted-from-uuid',
    lootedFromNameKey: 'looted-from-name',

    generatedFromKey: 'generated-from',
    hiddenKey: 'hidden',
};
