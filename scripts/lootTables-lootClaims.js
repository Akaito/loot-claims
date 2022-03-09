import { MODULE_CONFIG } from './config-lootClaims.js';
import { iamResponsibleGM } from './socket-lootClaims.js';
import { encodeUuidForFlag } from './module-lootClaims.js';
import { getNewCurrencyDocuments } from './currency-lootClaims.js';

export async function addLoot(tokens, {andCurrencyItems=true, ignorePlayerTokens=true}={}) {
    if (ignorePlayerTokens)
        tokens = tokens.filter(t => t.actor.type != 'pc');

    let memoizedTables = new Map;
    let missingTables = [];

    let currencyDocs = getNewCurrencyDocuments(tokens);

    for (let token of tokens) {
        //actor = actor?.actor || actor; // Change token to actor if needed.
        const namePair = token.name + ':' + token.actor.name;
        if (missingTables.includes(namePair)) continue;

        let table = memoizedTables[namePair];
        if (!table) table = await findLootTable(token);
        if (!table) {
            missingTables.push(namePair);
            continue;
        }

        await addLootTable(
            [token],
            table
        );
    }

    if (missingTables.length > 0) {
        const warnMsg = game.i18n.localize(`${MODULE_CONFIG.name}.someTablesMissing`);
        ui.notifications.warn(warnMsg);
        console.log(warnMsg, '\nLoot Claims found no tables matching these token:actor names:', missingTables);
    }
}

export async function findLootTable(actor, {ignorePlayerTokens=true}={}) {
    actor = actor?.actor || actor; // Change token to actor if needed.
    if (!actor) return undefined;
    if (ignorePlayerTokens && actor.type == 'pc') return undefined;

    const betterRollTablesActive = game.modules.get('better-rolltables')?.active || false;
    // May get a name like "Compendium.scope.compendium-id.actor-id".
    //let coreName = token.actor.data.flags?.core?.sourceId;
    //coreName = coreName.split('.');
    // The first table-get that gives us something wins.
    //   TODO?: Check the world first, then compendiums.  We may only be checking
    //          the world here.

    // First name that matches a table wins.
    let possibleTableNames = [
        // Token's or actor's name.
        actor.name,
        // Original, world-scope actor's name.
        game.actors.get(actor.id)?.name,
        // Original D&D Beyond importer's actor's name.
        actor.data.flags?.ddbimporter?.originalItemName,
        // TODO: Try to regex-out Token Mold name changes?
    ];

    // First check tables in the current world.
    for (const name of possibleTableNames) {
        const table = game.tables.getName(name);
        if (table) return table;
    }

    // Check the available compendiums.
    const packs = game.packs.filter(p => p.metadata.type == 'RollTable');
    for (const pack of packs) {
        for (const name of possibleTableNames) {
            const compendiumTableId = pack.index.find(e => e.name == name)?._id;
            if (!compendiumTableId) continue;
            const compendiumTable = await pack.getDocument(compendiumTableId);
            if (compendiumTable) return compendiumTable;
        }
    }
}

export async function addLootTable(tokens, lootTable, {ignorePlayerTokens=true}={}) {
    if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
    if (!iamResponsibleGM()) {
        ui.notifications.error(game.i18n.localize('loot-claims.responsibleGmOnly'));
        return;
    }

    if (ignorePlayerTokens)
        tokens = tokens.filter(t => t.actor.type != 'pc');

    console.log('addLootTable', tokens, lootTable);
    if (!lootTable) {
        let msg = 'addLootTable(): ' + game.i18n.localize(`${MODULE_CONFIG.name}.invalidTable`);
        ui.notifications.error(msg);
        console.error(msg + '\n', lootTable);
        return;
    }

    if (game.betterTables) {
        //game.betterTables.addLootToSelectedToken(this); // Nope; want to pass in item flags.
        //let result = await game.betterTables.addLootToSelectedToken(cloneTable, this.actor);
        for (let token of tokens) {
            let docs = await getDocSetViaBetterTables(token, lootTable);
            console.log('COLLECTED CHANGES FOR ONE TOKEN:', docs);
            //allItemUpdates.push(...changes.itemUpdates);
            //allNewItems.push(...changes.newItems);

            //changes.newItems.push(...changes.itemUpdates);
            //await token.actor.updateEmbeddedDocuments('Item', changes.newItems);
        
            await docs.parent.updateEmbeddedDocuments('Item', docs.itemUpdates);
            //await docs.parent.createDocuments('Item', docs.newItems);
            await Item.createDocuments(docs.newItems, {
                parent: docs.parent,
            });
        }
    }
    else {
        // TODO: UNIMPLEMENTED
        ui.notifications.error('Currently reliant on the Better Roll Tables module.');
    }
}

async function getDocSetViaBetterTables(token, realTable) {
    // Clone the table so we can do whatever without worry.
    // Including just drawing without replacement.
    let table = realTable.clone({}, {}, {temporary:true});
    //const newLoot = {};

    // TODO: Manually do draw-without-replacement if the table is flagged as such.
    //       Since drawing from a compendium table flagged as such doesn't work
    //       (never locks-out results).  Since we're making this module for us first,
    //       and we're using Anne Gregersen's _Monster Loot_ in a particular way for
    //       expediency, just give 1 of each result in the roll table.  Or, if it's
    //       a BetterRollTable with a formula for quantities, use that instead of 1.

    let drawnItems = [];
    for (let result of table.data.results) {
        let collection = game.packs.get(result.data.collection);
        let lootItem = duplicate(await collection?.getDocument(result.data.resultId));
        mergeObject(lootItem, {
            data: {
                /*
                data: {
                    quantity: 500,
                },
                */
                flags: {
                    [MODULE_CONFIG.name]: {
                        [MODULE_CONFIG.generatedFromKey]: realTable.uuid,
                    },
                },
            },
        });

        // Make use of BetterRolltables' quantity per entry, if present.
        const brtFlags = result.data.flags['better-rolltables'];
        if (brtFlags) {
            const quantityFormula = brtFlags['brt-result-formula']?.formula;
            if (quantityFormula) {
                try {
                    let quantity = (await (new Roll(quantityFormula)).roll({async: true}))?.total;
                    if (quantity) {
                        mergeObject(lootItem, {
                            data: {
                                quantity: Number(lootItem.data.quantity) * Number(quantity),
                            },
                        });
                    }
                }
                catch (e) {console.error(e);}
            }
        }

        drawnItems.push(lootItem);
    }

    const preExistingItems = token.actor.getEmbeddedCollection('Item');
    const itemUpdates = [];
    const newItems = [];
    // Figure out whether each loot entry is already present on the receiving
    // token, or is totally new to it.  How we add it differs depending on that.
    for (const lootItem of drawnItems) {
        /*
        // TODO: Don't assume the loot table's contents is a Compendium item.
        // (Thanks to Discord Crymic#9452 for help with compendium/pack access.)
        // https://discord.com/channels/170995199584108546/699750150674972743/897045003526869012
        const pack = await game.packs.get(loot.collection);
        const packDocs = await pack?.getDocuments();
        const packItem = await packDocs?.find(item => item.data._id == loot.resultId);
        if (!packItem) {
            ui.notifications.error(`No such compendium item: ${loot.collection}.${loot.resultId} (${loot.text}).`);
            continue;
        }
        */

        // TODO?: If we've already imported the item to this world (compare by name?), use that instead.

        // Consider a pre-existing item on the actor to be the same as this new
        // loot item if its type and name match.  Imperfect, but might be the most
        // sane means without being _too_ restrictive.
        const existingItem = preExistingItems.find(actorItem => actorItem.type == lootItem.type && actorItem.name == lootItem.name);
        // If the actor already has the item, just increase its quantity.
        if (existingItem) {
            // Not gaining a Broken version of an existing item: just increase existing quantity.
            //if (!actorItemUnbroken || actorItemUnbroken.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) {
            // TODO: Clean this area up.
            if (existingItem) {
                itemUpdates.push({
                    _id: existingItem.id,
                    //id: existingItem.id,
                    data: {
                        quantity: Number(existingItem.data.data.quantity) + Number(lootItem.data.quantity),
                    },
                });
            }
        }

        // If adding a "Broken" version of an item, hide the unbroken version.
        // TODO: Maybe do this after all new items are figured out.
        //       Makes it easier to handle two Broken Longsword items vs.
        //       one Broken Longsword item with a quantity of 2.
        //       Either of which should hide two Longsword items.
        if (lootItem.name.indexOf(game.i18n.localize('loot-claims.broken')) >= 0) {
            //const nameBroken = game.i18n.format('loot-claims.brokenItemFormat', lootItem.name);
            const actorItemUnbroken = preExistingItems.find(actorItem => {
                const existingItemNameBroken = game.i18n.format('loot-claims.brokenItemFormat', {name:actorItem.name});
                // Don't compare item types.  Broken versions are likely to be loot or something; instead of equipment.
                return existingItemNameBroken == lootItem.name;
            });
            if (actorItemUnbroken && !actorItemUnbroken.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) {
                itemUpdates.push({
                    _id: actorItemUnbroken.id,
                    //id: actorItemUnbroken.id,
                    flags: {
                        [MODULE_CONFIG.name]: {
                            [MODULE_CONFIG.hiddenKey]: MODULE_CONFIG.HIDDEN_REASON_BROKEN,
                        },
                    },
                });
            }
        }

        // Make a new one if it doesn't exist yet.
        if (!existingItem) {
            //log('making new item from packItem', lootItem, table);
            mergeObject(lootItem, {
                data: {
                    quantity: Number(lootItem.data.quantity),
                },
                flags: {
                    [MODULE_CONFIG.name]: {
                        //'source-item': encodeUuidForFlag(lootItemData.uuid),
                        [MODULE_CONFIG.generatedFromKey]: encodeUuidForFlag(table.uuid),
                    },
                },
            });
            //let newItemLootFlags = newItemData.data.flags['loot-claims'] || {};
            //newItemLootFlags[MODULE_CONFIG.generatedFromKey] = pack.uuid;
            newItems.push(lootItem);
        }
    }

    //log('itemUpdates', itemUpdates);
    //log('newItems', newItems);

    return {
        parent: token.actor,
        itemUpdates,
        newItems,
        //itemUpdates: itemUpdates.map(up => mergeObject({_id: token.actor.id}, up)),
        //newItems: newItems.map(n => mergeObject({parent: token.actor}, n)),
    };

    // Update quantities.
    await token.actor.updateEmbeddedDocuments('Item', itemUpdates);
    // Create items.
    //await token.actor.createEmbeddedDocuments('Item', newItems);
    await Item.createDocuments(newItems/*.map(item => item.data)*/, {
        parent: token.actor,
    });
    //await table.reset(); // No point; it's a cloned table.
}
