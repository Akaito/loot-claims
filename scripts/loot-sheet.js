import { MODULE } from './config.js';

export class LootSheet_dnd5e extends ActorSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 800,
            height: 600,
            classes: [MODULE.ns, 'sheet', 'actor'],
        });
    }

    get template() {
        return `modules/${MODULE.name}/templates/loot-sheet.hbs`;
    }
}
