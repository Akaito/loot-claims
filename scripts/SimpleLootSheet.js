import { MODULE_CONFIG } from './config.js';
import { claimFlagFromUuid, decodeUuidFromFlag, encodeUuidForFlag, handleSocketGm, iamResponsibleGM, uuidFromClaimFlag } from './module.js';

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
async function makeClaim(claimantUuid, claimType, itemUuid) {
    console.log('makeClaim()', claimantUuid, claimType, itemUuid);

    const message = {
        type: MODULE_CONFIG.messageTypes.CLAIM_REQUEST,
        claimType,
        claimantUuid,
        itemUuid,
    };
    // TODO: Make this true only if we're the responsible GM.  Not just any GM.
    if (iamResponsibleGM()) {
        await handleSocketGm(message, game.user.data._id);
    }
    else {
        new Promise(resolve => {
            // TODO: Move response to a function above this scope, so the GM user can call it, too?
            socket.emit(MODULE_CONFIG.socket, message, response => {
                    //console.log('GOT A REQUEST RESPONSE!');
                    //console.log(response);
                    ui.notifications.warn("Got request response!");
                    resolve(response);
                }
            );
        });
    }
}

export async function findLootTable(actor) {
    actor = actor?.actor || actor; // Change token to actor if needed.
    if (!actor) return undefined;
    const betterRollTablesActive = game.modules.get('better-rolltables')?.active || false;
    // May get a name like "Compendium.scope.compendium-id.actor-id".
    //let coreName = token.actor.data.flags?.core?.sourceId;
    //coreName = coreName.split('.');
    // The first table-get that gives us something wins.
    //   TODO?: Check the world first, then compendiums.  We may only be checking
    //          the world here.

    let possibleTableNames = [
        actor.name, // Token's or actor's name.
        game.actors.get(actor.id)?.name, // Original, world-scope actor's name.
        actor.data.flags?.ddbimporter?.originalItemName, // Original D&DB importer's actor's name.
    ];
    for (const name of possibleTableNames) {
        const table = game.tables.getName(name);
        if (table) return table;
    }

    // Next, try the compendiums.
    const packs = game.packs.filter(p => p.metadata.type == 'RollTable');
    for (const pack of packs) {
        for (const name of possibleTableNames) {
            const compendiumTableId = pack.index.find(e => e.name == name)?._id;
            if (!compendiumTableId) continue;
            const compendiumTable = await pack.getDocument(compendiumTableId);
            if (compendiumTable) return compendiumTable;
        }
    }

    /*
    return game.tables.getName(actor.name) || // used to be token's name, which _can_ be useful
        // Same name as the original actor (if there is one).
        game.tables.getName(game.actors.get(actor.id)?.name) ||
        // Same name as the original thing imported by the D&D Beyond Importer module.
        game.tables.getName(token.actor.data.flags?.ddbimporter?.originalItemName)
        // TODO: Try to regex-out Token Mold name changes?
    ;
    */
}

/// In-place shuffle.
/// From https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array/6274381#6274381
function shuffleArray(arr) {
    for (let i = arr.length - 1; 0 < i; --i) {
        const j = Math.floor(Math.random() * (i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function giveLootTo(itemData, claimantUuids, winnerUuid) {
    winnerUuid = decodeUuidFromFlag(winnerUuid);
    claimantUuids = claimantUuids.map(uuid => decodeUuidFromFlag(uuid));
    console.log('claimantUuids', claimantUuids);

    let quantityWinner = 1, quantityOthers = 0, oneAtATime = false;
    // Typical case for a singular item, or a stack of items sufficient for everyone to get one.
    const itemQuantity = Math.floor(Number(itemData.data.quantity));
    if (1 < itemQuantity) {
        // Not enough for everyone to get at least 1: hand them out one at a time.
        if (itemQuantity < claimantUuids.length) {
            // Special-case a stack greater than 1, but less than the number of claimants/recipients.
            // Behavior above always has the winner getting the remainder, or what would be the whole
            // stack in this case.  Instead, we'd want to hand out singles to a random subset of all claimants.
            // TODO: Adjust how we choose and mark winners, so it's all in one place (the caller of giveLootTo maybe).
            oneAtATime = true;
            claimantUuids = shuffleArray(claimantUuids);
        }
        // Enough for everyone to get at least 1: winner takes the remainder.
        else {
            quantityOthers = Math.floor(itemQuantity / claimantUuids.length);
            quantityWinner = quantityOthers + itemQuantity % claimantUuids.length;
        }
    }
    console.log('quantity winner', quantityWinner, 'others', quantityOthers, 'one at a time?', oneAtATime);

    //console.log('recipientItemData', recipientItemData);
    for (const [recipientUuidIndex, recipientUuid] of claimantUuids.entries()) {
        //console.log('recipientUuid', recipientUuid);
        let parent = await fromUuid(recipientUuid);
        parent = parent.actor || parent; // To make tokens and actors the "same".
        if (!oneAtATime) {
            const currentlyAtWinner = recipientUuid == winnerUuid;
            if (!currentlyAtWinner && quantityOthers == 0) continue;
            mergeObject(itemData, {
                data: {
                    quantity: currentlyAtWinner ? quantityWinner : quantityOthers,
                },
            });
        }
        // Special case of handing out a stack of size < claimant count; giving one to a random subset.
        else {
            // Stop if we've already handed all the items out.
            if (recipientUuidIndex + 1 > itemQuantity) break;
            mergeObject(itemData, {
                data: {
                    quantity: 1,
                },
            });
        }
        const recipientItem = await Item.create(itemData, {
            parent,
        });
        //console.log('recipientItem', recipientItem);
    }
}

export class SimpleLootSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 700,
            height: 'auto',
            classes: [MODULE_CONFIG.ns, 'sheet', 'actor'],
        });
    }

    get template() {
        return `modules/${MODULE_CONFIG.name}/templates/loot-sheet.hbs`;
    }

    activateListeners(html) {
        html.find('.player-claims').click(this._onClaimClick.bind(this));
        html.find('.reset-loot').click(this._onResetLootClick.bind(this));
        html.find('.add-loot-table').click(this._onAddLootTableClick.bind(this));
        html.find('.distribute-loot').click(this._onDistributeLootClick.bind(this));

        super.activateListeners(html);
    }

    async getData() {
        let data = super.getData();
        data.MODULE_CONFIG = MODULE_CONFIG;

        data.lootTable = await findLootTable(this);

        data.isGM = game.user.isGM;
        //data.iamResponsibleGm = iamResponsibleGM(); // Storing this in this way causes the result to be false somehow.

        // Add claims data in a different layout for the sake of Handlebars templating.
        data.claims = {};
        for (let item of this.actor.items) {
            // dnd5e: skip "natural" weapons, spells, features, etc.
            if (item.data?.data?.weaponType == 'natural') continue;
            if (item.data?.data?.armor?.type == 'natural') continue;
            if (MODULE_CONFIG.excludedItemTypes.includes(item.type)) continue;
            if (item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) continue;

            const ourFlags = item.data.flags[MODULE_CONFIG.name];
            console.log('           QUANTITY', item);
            data.claims[item.uuid] = {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                quantity: item.data.data.quantity,
                lootedBy: ourFlags ? ourFlags[MODULE_CONFIG.lootedByKey] : undefined,
                needs: [],
                greeds: [],
            };
            if (!ourFlags) continue;

            for (const key of Object.keys(ourFlags)) {
                if (!key.startsWith('claim~')) continue;

                const value = ourFlags[key];
                const claimantUuid = uuidFromClaimFlag(key);
                let actor = await fromUuid(claimantUuid);
                if (!actor) {
                    //console.log(`Skipping Actor ID in claims flags which didn't match an actor: ${key}`);
                    continue;
                }
                actor = actor.actor ? actor.actor : actor; // Get Actor5e from TokenDocument5e if needed.

                let lootedByUuid = uuidFromClaimFlag(ourFlags[MODULE_CONFIG.lootedByKey]);
                console.log('looted by', lootedByUuid, 'we are', claimantUuid);

                let claimant = {
                    uuid: claimantUuid,
                    name: actor.name,
                    img: actor.img,
                    winner: lootedByUuid == claimantUuid,
                };
                switch (value) {
                    case MODULE_CONFIG.needKey: data.claims[item.uuid].needs.push(claimant); break;
                    case MODULE_CONFIG.greedKey: data.claims[item.uuid].greeds.push(claimant); break;
                }
            }
        }

        //console.log('CLAIMS laid out for hbs', data.claims);
        return data;
    }


    async _onClaimClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const itemUuid = element.closest('.item').dataset.itemUuid;
        //let item = this.actor.getOwnedItem(itemId);
        //let item = this.actor.getEmbeddedDocument('Item', itemId, {strict:false});
        let item = await fromUuid(itemUuid);
        // TODO: FUTURE: Don't use flags, since they're stored in the DB.  Use transient memory.
        let flags = item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey) || {};
        //console.log('item', item);
        //console.log('flags', flags);

        const claimType = element.closest('.player-claims').dataset.claimType;

        // TODO: If more than one token is controlled, make claims from all of them?
        const selectedOwnedToken = canvas.tokens.controlled.filter(t=>t.isOwner)[0];
        const claimantUuid =
            // A selected, owned token has top priority as being the claimant.
            // For example, if a player is controlling themselves and a sidekick or
            // another, absent player, they can pick which one is making the claim.
            selectedOwnedToken?.actor?.uuid ||
            // If no owned token is selected, fall back to the user's assigned character.
            (game.user.character ? `Actor.${game.user.character.id}` : undefined);
        console.log('claimant', claimantUuid);
        if (!claimantUuid) {
            //console.log('No claimant available.  Tried user\'s character and a controlled token.');
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noClaimantAvailable`));
            return;
        }

        // check if this is a no-op
        // claimants will be a map of claimant actor ID -> claim type
        const hasExistingClaim = flags[claimantUuid] == claimType;
        if (hasExistingClaim) {
            //console.log('Skipping redundant claim.');
            return;
        }

        makeClaim(claimantUuid, claimType, item.uuid);
    }

    async _onDistributeLootClick(event) {
        event.preventDefault();
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        //if (!this.iamResponsibleGm) {
        if (!iamResponsibleGM()) {
            ui.notifications.error("Only the arbitrarily-chosen responsible GM can distribute loot.");
            return;
        }

        const element = event.currentTarget;
        const actor = this.actor;
        //console.log(actor);

        /* REM
        const uuid = <token>.actor.uuid;
        let document = await fromUuid(uuid);
        let actorData = document.data.actorData || document.data; // To ensure unlinked tokens resolve to the "same" thing as linked ones.

        note fromUuid on a client (non-GM?) returns an object.
        fromUuid on the stand-alone server GM yields an Actor5e (or token document if unlinked)
        */

        //console.log('items:');
        for (const [lootedItemId, lootedItem] of this.actor.items.entries()) {
            // Skip items that've already been looted.
            if (lootedItem.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey)) continue;

            const needs = Object.entries(
                lootedItem.data.flags[MODULE_CONFIG.name] || {}
                )
                ?.filter(entry => entry[1] == MODULE_CONFIG.needKey)
                ?.map(entry => entry[0]);
            const greeds = Object.entries(
                lootedItem.data.flags[MODULE_CONFIG.name] || {}
                )
                ?.filter(entry => entry[1] == MODULE_CONFIG.greedKey)
                ?.map(entry => entry[0]);

            // Roll among the prioritized set of claimants (needs beat greeds).
            let claimantIds = needs.length > 0 ? needs : greeds;
            // Skip if no-one wants the item.
            if (claimantIds.length <= 0) continue;

            // Pick a winner.
            // TODO: Chat card, Dice So Nice, something else?
            const winnerUuid = uuidFromClaimFlag(claimantIds[Math.floor(Math.random() * claimantIds.length)]);

            let recipientItemData = duplicate(lootedItem);
            // Clear claim keys, and set where it came from.
            recipientItemData.flags[MODULE_CONFIG.name] = {
                'looted-from-uuid': this.actor.uuid,
                'looted-from-name': this.actor.name,
            };
            // The recipient's new item shouldn't be equipped, since it's just been looted.
            if (recipientItemData.data.equipped === true) { // dnd5e, possibly other systems
                recipientItemData.data.equipped = false;
            }

            giveLootTo(recipientItemData, claimantIds, winnerUuid);

            // Mark the lootee's item as having been looted.
            // TODO: Mark array of winners, not just single, due to stack-split wins?
            // TODO: Distribute all updates in one update.  Optimization, and prevents sheet flicker.
            await lootedItem.setFlag(MODULE_CONFIG.name, MODULE_CONFIG.lootedByKey, winnerUuid);
        }
    }

    async _onResetLootClick(event) {
        event.preventDefault();
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        if (!iamResponsibleGM()) {
            ui.notifications.error(game.i18n.localize('simple-loot-sheet-fvtt.responsibleGmOnly'));
            return;
        }

        const actor = this.actor;

        MODULE_CONFIG.functions.reset(actor);
    }

    async _onAddLootTableClick(event) {
        if (!game.user.isGM) { ui.notifications.error("Only GM players can distribute loot."); return; }
        if (!iamResponsibleGM()) {
            ui.notifications.error(game.i18n.localize('simple-loot-sheet-fvtt.responsibleGmOnly'));
            return;
        }

        const element = event.currentTarget;
        console.log('elements:', element, element.closest('[data-roll-table-uuid]'));
        const tableUuid = $(element.closest('[data-roll-table-uuid]'))?.data('roll-table-uuid');
        const table = await fromUuid(tableUuid);
        if (!table)  {
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noSuchTable`));
            console.log('Was asked to find a table, but none existed with the given uuid:', tableUuid);
            return;
        }

        if (game.betterTables) {
            //game.betterTables.addLootToSelectedToken(this); // Nope; want to pass in item flags.
            //let result = await game.betterTables.addLootToSelectedToken(cloneTable, this.actor);
            UseBetterTables(this.token, table);
        }
        else {
            // TODO: UNIMPLEMENTED
            ui.notifications.error('Currently reliant on the Better Roll Tables module.');
        }
    }
}

// Mostly from a macro I hadn't shared yet.
async function UseBetterTables (token, realTable) {
    // Clone the table so we can do whatever without worry.
    // Including just drawing without replacement.
    let table = realTable.clone({}, {}, {temporary:true});

    //const brtBuilder = new BRTBuilder(table);
    //const results = await brtBuilder.betterRoll();
    //const br = new BetterResults(results);
    /*
    const betterResults = await br.buildResults(table);
    const currencyData = br.getCurrencyData();
    const lootCreator = new LootCreator(betterResults, currencyData);
    await lootCreator.addCurrenciesToToken(token);
    await lootCreator.addItemsToToken(token);
    */

    const newLoot = {};
    //const brtBuilder = new BRTBuilder(table);
    //const results = await brtBuilder.betterRoll();
    //const brtResults = new BetterResults(results);
    //console.log('  BRT', brtBuilder, brtResults);

    // TODO: Manually do draw-without-replacement if the table is flagged as such.
    // Since drawing from a compendium table flagged as such doesn't work (never locks-out results).

    let drawnItems = [];
    for (let result of table.data.results) {
        //console.log('result', result);
        let collection = game.packs.get(result.data.collection);
        /*
        let lootItem = (await collection?.getDocument(result.data.resultId))?.clone({
                data: {
                    flags: {
                        [MODULE_CONFIG.name]: {
                            [MODULE_CONFIG.generatedFromKey]: realTable.uuid,
                        },
                    },
                },
            },
            false,
            {temporary:true});
        */
        let lootItem = duplicate(await collection?.getDocument(result.data.resultId));
        //lootItem.data.data.quantity = 500;
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
        //console.log('compendium lootItem', lootItem);
        const brtFlags = result.data.flags['better-rolltables'];
        //console.log('brtFlags', brtFlags);
        if (brtFlags) {
            const quantityFormula = brtFlags['brt-result-formula']?.formula;
            //console.log('formula', quantityFormula);
            console.log('are we even trying to get a quantity?', quantityFormula);
            try {
                let quantity = (await (new Roll(quantityFormula)).roll({async: true}))?.total;
                console.log('quantity', quantity, lootItem.data.quantity);
                if (quantity) {
                    mergeObject(lootItem, {
                        data: {
                            quantity: Number(lootItem.data.quantity) * Number(quantity),
                        },
                    });
                    //console.log('new quantity', lootItem.data.data.quantity);
                }
            }
            catch (e) {console.error(e);}
        }
        drawnItems.push(lootItem);
    }
    //console.log('drawn items', drawnItemsData);

    const preExistingItems = token.actor.getEmbeddedCollection('Item');
    const itemUpdates = [];
    const newItems = [];
    // Figure out whether each loot entry is already present on the receiving
    // token, or is totally new to it.  How we add it differs depending on that.
    for (const lootItem of drawnItems) {
        // TODO: Consider localization.  Both the word, and the name structure.
        const isBrokenItem = lootItem.name.startsWith('Broken ');
        //console.log(lootItemData);
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
            if (existingItem) {
                itemUpdates.push({
                    _id: existingItem.id,
                    id: existingItem.id,
                    data: {
                        quantity: Number(existingItem.data.data.quantity) + Number(lootItem.data.quantity),
                    },
                });
            }
        }

        // Need to hide the existing, not-broken version if it isn't already.
        if (lootItem.name.startsWith('Broken')) {
            const actorItemUnbroken = preExistingItems.find(actorItem => {
                const nameGood = `Broken ${actorItem.name}` == lootItem.name;
                console.log('not-broken search', actorItem.name, lootItem.name, nameGood);
                return actorItem.type == lootItem.type && nameGood;
            });
            if (actorItemUnbroken && actorItemUnbroken.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.hiddenKey)) {
                itemUpdates.push({
                    _id: actorItemUnbroken.id,
                    id: actorItemUnbroken.id,
                    flags: {
                        [MODULE_CONFIG.name]: {
                            [MODULE_CONFIG.hiddenKey]: 'broken', // TODO: Use some thought-out value.
                        },
                    },
                });
            }
        }

        // Make a new one if it doesn't exist yet.
        if (!existingItem) {
            console.log('making new item from packItem', lootItem, table);
            mergeObject(lootItem, {
                data: {
                    quantity: Number(lootItem.data.quantity),
                },
                flags: {
                    [MODULE_CONFIG.name]: {
                        //'source-item': encodeUuidForFlag(lootItemData.uuid),
                        'generated-from': encodeUuidForFlag(table.uuid),
                    },
                },
            });
            //let newItemLootFlags = newItemData.data.flags['simple-loot-sheet-fvtt'] || {};
            //newItemLootFlags[MODULE_CONFIG.generatedFromKey] = pack.uuid;
            newItems.push(lootItem);
        }
    }

    //console.log('itemUpdates', itemUpdates);
    console.log('newItems', newItems);

    // Update quantities.
    await token.actor.updateEmbeddedDocuments('Item', itemUpdates);
    // Create items.
    //await token.actor.createEmbeddedDocuments('Item', newItems);
    await Item.createDocuments(newItems/*.map(item => item.data)*/, {
        parent: token.actor,
    });
    //await table.reset(); // No point; it's a cloned table.
}
