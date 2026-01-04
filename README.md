# Orevintory

A Minecraft Bedrock add-on that routes bulk metal smeltables into a per-player virtual inventory for copper, iron, and gold. Players can pull from the Orevintory into furnaces and blast furnaces via a quick selector with auto-refill.

## What it does

- Intercepts pickups of supported ores/raw metals and stores them in a per-player Orevintory bank.
- Adds `/orev` to view stored counts and withdraw 1 / 16 / 64 back into the normal inventory.
- Prompts when opening a furnace or blast furnace to select an Orevintory source.
- Auto-refills the input slot from the selected source while available.

## Supported items (authoritative)

**Copper**
- `minecraft:copper_ore`
- `minecraft:deepslate_copper_ore`
- `minecraft:raw_copper`

**Iron**
- `minecraft:iron_ore`
- `minecraft:deepslate_iron_ore`
- `minecraft:raw_iron`

**Gold**
- `minecraft:gold_ore`
- `minecraft:deepslate_gold_ore`
- `minecraft:raw_gold`
- `minecraft:nether_gold_ore`

## Installation (local)

1. Copy the `behavior_pack` and `resource_pack` folders into:
   - **Windows**: `%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_behavior_packs` and `development_resource_packs`
   - **Android**: `/games/com.mojang/development_behavior_packs` and `development_resource_packs`
   - **iOS**: Use the Files app and place into the corresponding development pack folders.
2. Create a new world or edit an existing world.
3. Enable both packs in **Behavior Packs** and **Resource Packs**.
4. Enable required Experimental Features (see below).

## Required Experimental Features / Beta APIs

- **Holiday Creator Features** (enables scripting for behavior packs).
- **Beta APIs / Script API** (enables `@minecraft/server` and `@minecraft/server-ui`).

> Tested against `min_engine_version` 1.20.40 with Script API beta modules in the manifest.

## Usage

- Mine or pick up supported ores. They are removed from normal inventory and stored in Orevintory.
- Run `/orev` to view counts and withdraw items.
- Open a furnace or blast furnace to get a prompt to select an ore source.
- Auto-refill will keep the input slot filled while Orevintory has the selected ore.

## Known limitations (engine constraints)

- **No reliable furnace UI close event**: the add-on clears its lock after 60 seconds of inactivity rather than exactly on UI close.
- **Manual removal detection**: Bedrock scripting does not expose a specific event for manually removing items from container slots, so auto-refill cannot be disabled automatically on manual removal. A “Disable Auto-Refill” action is provided in the selector UI.

## Test plan

1. **Pickup storage**
   - Mine iron ore.
   - Verify the normal inventory does not fill with iron ore and `/orev` shows the count increasing.
2. **Furnace injection + auto-refill**
   - Open a furnace and select iron ore.
   - Verify the input slot fills from Orevintory and refills when it empties.
3. **Change source**
   - Open the selector again and choose gold.
   - Verify the furnace input swaps to gold and auto-refill uses gold.
4. **Withdraw**
   - Use `/orev` and withdraw 1/16/64.
   - Verify items appear in the normal inventory if there is space.

## Project structure

```
behavior_pack/
  manifest.json
  scripts/
    main.js
resource_pack/
  manifest.json
```
