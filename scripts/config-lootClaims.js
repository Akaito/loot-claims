import { reset } from './module-lootClaims.js';
import { changeSheet } from './util-lootClaims.js';
import { addLoot, findLootTable, addLootTable } from './lootTables-lootClaims.js';
import { givePermission } from './lootTaking-lootClaims.js';
import { addCurrencyItems, findCurrencyItem } from './currency-lootClaims.js';

export const MODULE_CONFIG = {
    name: 'loot-claims',
    title: 'Loot Claims',
    socket: 'module.loot-claims',

    // Sometimes used to prefix logs so we can spot ours easily.
    emoji: '\u{1F4B0}',
    logPrefix:  '\u{1F4B0} loot-claims | ',

    excludedItemTypes: ['class', 'spell', 'feat'],

    /// Gets filled out as currencies are looked up.
    memoizedCurrencies: {},

    functions: {
        changeSheet,

        /// Takes an array of tokens.
        ///
        /// Will attempt to discover loot tables which match the token/actor by
        /// name.  Including the original name from D&D Beyond if it was
        /// imported via Mr. Primate's module.
        addLoot,

        /// Takes a token, and a single loot table to use for all the tokens.
        addLootTable,

        givePermission,
        
        /// Takes one arg: an actor or token.
        ///
        /// You probably won't need to use this directly.  It's intended as a
        /// way to step in and take over the way Loot Claims finds a table.
        /// Replacing that process with your own.
        findLootTable,

        /// Ignorable unless you want to change the currency mapping for your system/world.
        ///
        /// Takes currency abbreviation, like dnd5e's "gp" or "cp".
        /// Returns an Item (Item5e in dnd5e).
        findCurrencyItem,

        /// Add currency items equivalent to the currency object's fields.
        ///
        /// Note this will _NOT_ remove the existing currency!  It just adds
        /// items to represent it for easier looting with Loot Claims.
        addCurrencyItems,

        /// Revert changes made by loot-claims.
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
