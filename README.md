<!-- Foundry compatibility info. -->
![Foundry Minimum Core Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FAkaito%2Floot-claims%2Fmain%2Fmodule.json&label=Minimum%20Foundry%20Version&query=$.minimumCoreVersion&colorB=orange) ![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FAkaito%2Floot-claims%2Fmain%2Fmodule.json&label=Tested%20With%20Version&query=$.compatibleCoreVersion&colorB=orange)
<!-- Badges to get a rough idea of how many others use this module. -->
![GitHub all releases](https://img.shields.io/github/downloads/Akaito/loot-claims/total) ![Latest Release Download Count](https://img.shields.io/github/downloads/Akaito/loot-claims/latest/module.zip)
<!-- Badges that help identify an old, decrepit repo. -->
![GitHub last commit (main)](https://img.shields.io/github/last-commit/Akaito/loot-claims/main) ![GitHub issues](https://img.shields.io/github/issues/Akaito/loot-claims) ![GitHub pull requests](https://img.shields.io/github/issues-pr/Akaito/loot-claims) ![GitHub forks](https://img.shields.io/github/forks/Akaito/loot-claims?style=social)

<!--- Forge Bazaar Install % Badge -->
<!--- replace <your-module-name> with the `name` in your manifest -->
<!--- ![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2F<your-module-name>&colorB=4aa94a) -->

Non-destructively distribute loot more quickly by letting players declare their level of interest, and randomly distributing loot among those claims.
Instead of players feeling like they have to discuss who gets what before clicking a button and taking an item away.
If this module's ever breaking anything you can just disable it to see the NPCs as they were.
Since items are never removed, only flagged.

### How players use it
From a new Actor sheet, players can make 'will use' or 'can carry' claims for items of any interest.
All of an actor's loot can then be distributed with a click; rolling who gets how many of each item with claims on it.
If there are both 'will use' and 'can carry' claims made for an item, the 'can carry' claims are ignored.
In that case, only the 'will use' claims have opportunity to receive the items.
If there's multiple of an item, it will be distributed as evenly as possible among all claimants.

### Non-destruction of data, and 'reset' feature
This module is entirely non-destructive of normal actor/item data, as it works within the space of its own flags as much as possible.
This module's Actor sheet hides natural weapons, spells, features, etc. to prevent players from seeing/looting them.
But it doesn't remove those items.
Since the defeated NPC's items aren't removed when looted-- only marked up with flags relevant to Loot Claims-- this module has a 'Reset Loot' feature.
Resetting loot removes items added via roll tables, and "restores" items looted by players.
Making re-running the same content for another group of players far easier.
At any time, loot reset or not, you can switch back to a normal Actor sheet; which will always show the Actor with all its normal things on it regardless of looted state.
Loot can be reset either from the Loot Claims actor sheet, or from a scene navigation context menu to reset them all at once.
Actors assigned to players are unaffected.

### Loot added from roll tables
Loot can be added via a roll table sharing its name with any of: the token's name, the token's actor's name, or the original name of the actor when it was imported by MrPrimate's D&D Beyond Importer module.
So that one-off creature name Xipe, which is mostly just an Oni, can still have match up with a sensical loot table.
Compendiums are also searched, so there's no need to add the tables to your world.
At time of writing, adding from a loot table may not work in the way others want.
Every one of a roll table's results/entries will be added to the actor being looted; respecting Better Rolltables specified quantity.
This is how it works for now, because it's the style I want for the simplified way I'm using Anne Gregersen's _[Monster Loot](https://www.dmsguild.com/product/275550/Monster-Loot-Vol-1--Monster-Manual)_ series of books.
I expect I'll add more options for how roll tables are used later.

#### Partial support of Better Rolltables
This module is aware of data from the Better Rolltables module, but Loot Claims doesn't use that module's functionality directly.
None of its API functions provided enough control/information for what I was after, so instead this module just reads and respects the quantity formula set in a Better Rolltable's table's result entries.

### System flexibility
This module's functions are/will be used via the module's global config object.
So if the module doesn't officially support the system you're playing in, or you just want some part of it to work differently, you can just replace functionality parts of its behavior.
In the future, this module will support detecting the system it's in and setting the appropriate table of functions.
Or something-or-other Hooks.
Have to learn more about those.

### Misc.
Items players loot are flagged with what they were looted from.
This is currently unused, but could be neat; for showing players where they got some of their things.

### Suggested modules
- [Better Rolltables](https://foundryvtt.com/packages/better-rolltables/)
  Allows richer data to be set on roll tables.
  Such as a dice formula for how many of a table's result's item is given.
- [Give item to another player](https://foundryvtt.com/packages/give-item/)
  Enables players to send each other items.
  So if they change their mind after loot's been distributed, they can transfer things without the GM's help.
- [D&D Beyond Importer](https://foundryvtt.com/packages/ddb-importer/)
  This module pays attention to the name of actors from when they were originally imported in this way.
  So if you rename one of your Oni tokens to Xipe or some-such, it can still be matched up to its roll table when adding loot to it.

## FAQ
- **Q:** Can this module be used with lootsheetnpc5e?
  
  **A:** The two _should_ work all right together, but this is untested.  Personally, lootsheetnpc5e kept breaking actors/tokens on me anytime Foundry updated.  Making them inaccessible even to the GM.  This may have been user error on my part, or issues within that module itself; uncertain.  So I wrote this hopefully-simpler module to not have to rely on that one.

- **Q:** Will systems other than dnd5e be supported?
  
  **A:** Someday, if there's interest!  I'm aiming to shape this one so it's not hard to support other systems.  But it's not there yet.  Just getting it to do the basic thing I want first.

## TODO
- [ ] Currency.  :(
- [ ] Use libWrapper.
- [ ] Badge on claimants showing looted quantity.
- [ ] Test distributing loot from a linked actor.
- [ ] Replaceable functions where they're system-specific.
      Set them in MODULE_CONFIG.functions, and call them from there.  Others can replace them.
      Or use Hooks?
- [ ] Have some settings.
      - [ ] Option to auto-distribute item once all active players have set their claim?
            Or marked themselves on the whole sheet as being "ready"?  (Would introduce actor flags.)
      - [ ] Auto-add loot from table when... sheet is rendered? (Player could render it first.) Permission is given? (Could be given by means outside of the table.)
      - [ ] Limit roll table search to specific compendium(s), or the world.
- [ ] Dialog to pick loot table if multiple look viable.
- [ ] Chat card showing results?
- [ ] Resetting loot also resets gained items from looting if the actor is unlinked?
- [ ] Implement "Steal"?  Future feature _maybe_.

---




# How to use this Template to create a versioned Release

1. Open your repository's releases page.

![Where to click to open repository releases.](https://user-images.githubusercontent.com/7644614/93409301-9fd25080-f864-11ea-9e0c-bdd09e4418e4.png)

2. Click "Draft a new release"

![Draft a new release button.](https://user-images.githubusercontent.com/7644614/93409364-c1333c80-f864-11ea-89f1-abfcb18a8d9f.png)

3. Fill out the release version as the tag name.

If you want to add details at this stage you can, or you can always come back later and edit them.

![Release Creation Form](https://user-images.githubusercontent.com/7644614/93409543-225b1000-f865-11ea-9a19-f1906a724421.png)

4. Hit submit.

5. Wait a few minutes.

A Github Action will run to populate the `module.json` and `module.zip` with the correct urls that you can then use to distribute this release. You can check on its status in the "Actions" tab.

![Actions Tab](https://user-images.githubusercontent.com/7644614/93409820-c1800780-f865-11ea-8c6b-c3792e35e0c8.png)

6. Grab the module.json url from the release's details page.

![image](https://user-images.githubusercontent.com/7644614/93409960-10c63800-f866-11ea-83f6-270cc5d10b71.png)

This `module.json` will only ever point at this release's `module.zip`, making it useful for sharing a specific version for compatibility purposes.

7. You can use the url `https://github.com/<user>/<repo>/releases/latest/download/module.json` to refer to the manifest.

This is the url you want to use to install the module typically, as it will get updated automatically.

# How to List Your Releases on Package Admin

To request a package listing for your first release, go to the [Package Submission Form](https://foundryvtt.com/packages/submit) (accessible via a link at the bottom of the "[Systems and Modules](https://foundryvtt.com/packages/)" page on the Foundry website).

Fill in the form. "Package Name" must match the name in the module manifest.  Package Title will be the display name for the package.  Package URL should be your repo URL.
![image](https://user-images.githubusercontent.com/36359784/120664263-b49e5500-c482-11eb-9126-af7006389903.png)


One of the Foundry staff will typically get back to you with an approval or any further questions within a few days, and give you access to the package admin pages.

Once you have access to the [module admin page](https://foundryvtt.com/admin/packages/package/), you can release a new version by going into the page for your module, scrolling to the bottom, and filling in a new Package Version.

When listing a new version, Version should be the version number you set above, and the Manifest URL should be the manifest __for that specific version__ (do not use /latest/ here).
![image](https://user-images.githubusercontent.com/36359784/120664346-c4b63480-c482-11eb-9d8b-731b50d70939.png)

> ### :warning: Important :warning:
> 
> It is very important that you use the specific release manifest url, and not the `/latest` url here. For more details about why this is important and how Foundry Installs/Updates packages, read [this wiki article](https://foundryvtt.wiki/en/development/guides/releases-and-history).

Clicking "Save" in the bottom right will save the new version, which means that anyone installing your module from within Foundry will get that version, and a post will be generated in the #release-announcements channel on the official Foundry VTT Discord.


# FoundryVTT Module

Does something, probably

## Changelog
