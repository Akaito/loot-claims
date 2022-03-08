import { MODULE_CONFIG } from './config-lootClaims.js';
import { iamResponsibleGM } from './socket-lootClaims.js';
import { handleSocketGm } from './socket-lootClaims.js';
import * as util from './util-lootClaims.js';
const log = util.log;

export class ClaimantClaim {
    // Future: allow claiming only some quantity.
    constructor(uuid, claimType, name, img) {
        // Required.
        this.uuid = uuid;
        this.claimType = claimType;
        this.roll = false; // to be replaced by a Roll, or a numeric value.
        this.receivedQuantity = 0; // updated after loot is doled out.
        // Extra for ease of use (mostly in Handlebars).
        this.name = name;
        this.img = img;
    }
}

/// For the client to express interest in claiming an item (or passing on one).
///
/// References:
/// - https://discord.com/channels/170995199584108546/903652184003055677/903693659051008040
/// - https://discord.com/channels/170995199584108546/811676497965613117/903652184003055677
/// - https://discord.com/channels/170995199584108546/670336275496042502/835549329598840903
async function makeClaim(claimantUuids, claimType, itemUuid) {

    const message = {
        type: MODULE_CONFIG.messageTypes.CLAIM_REQUEST,
        claimType,
        claimantUuids,
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
                    ui.notifications.warn("Got request response!");
                    resolve(response);
                }
            );
        });
    }
}

export class ActorSheet_dnd5e extends ActorSheet {

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
        html.find('.add-currency-items').click(this._onAddCurrencyItems.bind(this));
        html.find('.give-permissions').click(this._onGivePermissionsClick.bind(this));
        html.find('.distribute-loot').click(this._onDistributeLootClick.bind(this));

        super.activateListeners(html);
    }

    async getData() {
        //log('--- BEGIN getData()');
        let data = super.getData();
        data.MODULE_CONFIG = MODULE_CONFIG;

        data.lootTable = await MODULE_CONFIG.functions.findLootTable(this);

        // TODO: Maybe use more unique names to avoid possible future conflicts from Foundry.
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

            // Get our module's flags for this item, and translate them into a form that's easier
            // for Handlebars templates to digest.
            const ourFlags = item.data.flags[MODULE_CONFIG.name];
            data.claims[item.uuid] = {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                quantity: item.data.data.quantity,
                [MODULE_CONFIG.lootedByKey]: ourFlags ? ourFlags[MODULE_CONFIG.lootedByKey] : undefined,
                //[MODULE_CONFIG.needKey]: item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimTypes) || [],
                //[MODULE_CONFIG.greedKey]: item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.greedKey) || [],
                //[MODULE_CONFIG.passKey]: item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.passKey) || [],
            };
            for (let claimType of MODULE_CONFIG.claimTypes) {
                if (!ourFlags || !ourFlags[MODULE_CONFIG.claimsKey]) {
                    data.claims[item.uuid][claimType] = [];
                }
                else {
                    data.claims[item.uuid][claimType] = ourFlags[MODULE_CONFIG.claimsKey]
                        .filter(claim => claim.claimType == claimType);
                }
            }
            if (!ourFlags) continue;

            for (let claimType of MODULE_CONFIG.claimTypes) {
                for (let claimantUuid of item.getFlag(MODULE_CONFIG.name, claimType) || []) {
                    let actor = null;//await fromUuid(claimantUuid.uuid);
                    if (!actor) {
                        //console.error('blah'); // TODO: Proper error message.
                        continue;
                    }
                    data.claims[item.uuid][claimType].push({
                        uuid: claimantUuid.uuid,
                        name: actor.token?.name || actor.name,
                        img: actor.token?.data?.img || actor.img,
                    });
                }
            }
        }

        // deprecating
        if (Object.values(this.actor.data?.data?.currency).reduce((a,b) => a+b) > 0)
            data.currency = this.actor.data.data.currency;
        else
            data.currency = null;

        // new, fake items way
        const currency = this.actor.data?.data?.currency ?? {}; // dnd5e
        data.currencyItems = this.actor.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.currencyPseudoItemsKey) ?? {};
        for (let [name,quantity] of Object.entries(currency)) {
            if (data.currencyItems[name]) continue;
            mergeObject(data.currencyItems, {
                name,
                quantity,
                icon: '<i class="fas fa-coins"></i>',
                //...MODULE_CONFIG.claimTypes.map(t => ({[t]: []})),
                // TODO: Don't hard-code the claim types.
                need: [], geed: [], pass: [],
            });
        }

        data.currencyClaims = this.actor.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.currencyClaimsKey) ?? {};
        if (!data.currencyPseudoItems) data.currencyPseudoItems = [];
        for (let [name,quantity] of (Object.entries(currency))) {
            if (Object.keys(data.currencyClaims)?.length > 0 && data.currencyClaims.find(cpi => cpi.name == name)) continue;
            data.currencyPseudoItems.push({
                name,
                quantity,
                icon: '<i class="fas fa-coins"></i>',
                claims: [],
            });
        }

        data.currencyPseudoItems = this.actor.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.currencyPseudoItemsKey) || [];
        for (let [name,quantity] of (Object.entries(currency))) { // dnd5e
            if (data.currencyPseudoItems.find(cpi => cpi.name == name)) continue;
            data.currencyPseudoItems.push({
                name,
                quantity,
                icon: '<i class="fas fa-coins"></i>',
            });
        }
        //data.currencyClaims = this.actor.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.currencyClaimsKey) ?? {};

        //log('--- END getData()');
        //log('CLAIMS laid out for hbs', data.claims);
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

        let claimType = element.closest('.player-claims').dataset.claimType;

        let claimantUuids = canvas.tokens.controlled // Prefer currently-selected tokens we own.
            .filter(token => token.isOwner)
            .map(token => token.actor?.uuid)
            .filter(uuid => uuid != undefined)
            // Don't make a claim again if we already have one of the same type being asked for.
            //.filter(uuid => itemLootFlags[uuid] ? itemLootFlags[uuid] != claimType : true)
        ;
        // Fallback to user's assigned character, if they have one.
        if (claimantUuids.length <= 0)
            claimantUuids = game.user.character ? [`Actor.${game.user.character.id}`] : []; // janky way to make it a uuid
        if (claimantUuids.length <= 0) {
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noClaimantAvailable`));
            return;
        }
        

        // If clicking on the same claim type on the same item the player's already in,
        // cancel it back to a "pass" claim.
        //if (let existingClaims = element.find('[data-claimant-uuid]')
        if (claimantUuids?.length == 1 && claimType != 'pass')  {
            if ((item.getFlag(MODULE_CONFIG.name, MODULE_CONFIG.claimsKey) || [])
                ?.find(claim => claim.uuid == claimantUuids[0])
                ?.claimType == claimType)
            {
                claimType = 'pass';
            }
        }

        await makeClaim(claimantUuids, claimType, item.uuid);
    }

    async _onGivePermissionsClick(event) {
        event.preventDefault();
        await MODULE_CONFIG.functions.givePermission([this.token]);
    }

    async _onDistributeLootClick(event) {
        event.preventDefault();
        //const element = event.currentTarget;
        await MODULE_CONFIG.functions.distributeLoot(this.actor);
    }

    async _onResetLootClick(event) {
        event.preventDefault();
        await MODULE_CONFIG.functions.reset(this.actor);
    }

    async _onAddLootTableClick(event) {
        event.preventDefault();

        const element = event.currentTarget;
        const tableUuid = $(element.closest('[data-roll-table-uuid]'))?.data('roll-table-uuid');
        const table = await fromUuid(tableUuid);
        if (!table)  {
            ui.notifications.error(game.i18n.localize(`${MODULE_CONFIG.name}.noSuchTable`));
            return;
        }

        await MODULE_CONFIG.functions.addLootTable([this.token], table);
    }

    async _onAddCurrencyItems(event) {
        event.preventDefault();
        await MODULE_CONFIG.functions.addCurrencyItems([this.token]);
    }
}
