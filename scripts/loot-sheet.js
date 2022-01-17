import { CONFIG } from './config.js';

export class SimpleLootSheet extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 800,
            height: 600,
            classes: [CONFIG.ns, 'sheet', 'actor'],
            name: 'LOOT SHEET NAME',
        });
    }

    get template() {
        return `modules/${CONFIG.name}/templates/loot-sheet.hbs`;
    }

    activateListeners(html) {
        html.find('.claim').click(this._onClaimClick.bind(this));

        super.activateListeners(html);
    }

    getData() {
        let data = super.getData();
        data.CONFIG = CONFIG;

        /*
        let flags = this.actor.data.flags[`${CONFIG.ns}`];
        if (flags) {
            // TODO: loop through, pushing player claim data into the local data object
        }
        */

        data.players = [];
        for (let player of game.users.players) {
            data.players.push(player);
        }

        return data;
    }


    _onClaimClick(event) {
        event.preventDefault();
        let element = event.currentTarget;
        let itemId = element.closest('.item').dataset.itemId;
        let item = this.actor.getOwnedItem(itemId);
    }
}
