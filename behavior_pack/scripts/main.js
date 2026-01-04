import { world, system, ItemStack, DynamicPropertiesDefinition } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const DEBUG = false;
const OREV_PROPERTY = "orev_data";
const OREV_VERSION = "orev_v";
const OREV_VERSION_NUMBER = 1;
const SESSION_TTL_TICKS = 20 * 60; // 60s idle timeout
const AUTO_REFILL_INTERVAL = 20; // 1s

const ORE_CONFIG = {
  "minecraft:copper_ore": { label: "Copper Ore", group: "copper", blast: true },
  "minecraft:deepslate_copper_ore": { label: "Deepslate Copper Ore", group: "copper", blast: true },
  "minecraft:raw_copper": { label: "Raw Copper", group: "copper", blast: true },
  "minecraft:iron_ore": { label: "Iron Ore", group: "iron", blast: true },
  "minecraft:deepslate_iron_ore": { label: "Deepslate Iron Ore", group: "iron", blast: true },
  "minecraft:raw_iron": { label: "Raw Iron", group: "iron", blast: true },
  "minecraft:gold_ore": { label: "Gold Ore", group: "gold", blast: true },
  "minecraft:deepslate_gold_ore": { label: "Deepslate Gold Ore", group: "gold", blast: true },
  "minecraft:raw_gold": { label: "Raw Gold", group: "gold", blast: true },
  "minecraft:nether_gold_ore": { label: "Nether Gold Ore", group: "gold", blast: true }
};

const ORE_IDS = Object.keys(ORE_CONFIG);

const sessions = new Map();

function logDebug(message) {
  if (DEBUG) {
    console.warn(`[Orevintory] ${message}`);
  }
}

function getPlayerKey(player) {
  return player.id;
}

function loadOreData(player) {
  const raw = player.getDynamicProperty(OREV_PROPERTY);
  if (typeof raw !== "string" || raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    logDebug(`Failed to parse data for ${player.name}: ${error}`);
    return {};
  }
}

function saveOreData(player, data) {
  player.setDynamicProperty(OREV_PROPERTY, JSON.stringify(data));
  player.setDynamicProperty(OREV_VERSION, OREV_VERSION_NUMBER);
}

function getOreCount(player, typeId) {
  const data = loadOreData(player);
  return Number(data[typeId] || 0);
}

function addOre(player, typeId, amount) {
  const data = loadOreData(player);
  data[typeId] = Number(data[typeId] || 0) + amount;
  saveOreData(player, data);
}

function removeOre(player, typeId, amount) {
  const data = loadOreData(player);
  const current = Number(data[typeId] || 0);
  const next = Math.max(0, current - amount);
  data[typeId] = next;
  saveOreData(player, data);
  return current - next;
}

function countInventoryItems(container, typeId) {
  let total = 0;
  for (let i = 0; i < container.size; i += 1) {
    const item = container.getItem(i);
    if (item && item.typeId === typeId) {
      total += item.amount;
    }
  }
  return total;
}

function removeInventoryItems(container, typeId, amount) {
  let remaining = amount;
  for (let i = 0; i < container.size; i += 1) {
    const item = container.getItem(i);
    if (!item || item.typeId !== typeId) {
      continue;
    }
    const take = Math.min(item.amount, remaining);
    if (take === item.amount) {
      container.setItem(i, undefined);
    } else {
      item.amount -= take;
      container.setItem(i, item);
    }
    remaining -= take;
    if (remaining <= 0) {
      break;
    }
  }
  return amount - remaining;
}

function canAddItem(container, typeId, amount) {
  const probe = new ItemStack(typeId, 1);
  const maxStack = probe.maxAmount || 64;
  let remaining = amount;
  for (let i = 0; i < container.size; i += 1) {
    const item = container.getItem(i);
    if (!item) {
      remaining -= maxStack;
    } else if (item.typeId === typeId) {
      remaining -= Math.max(0, maxStack - item.amount);
    }
    if (remaining <= 0) {
      return true;
    }
  }
  return false;
}

function addItemToInventory(container, typeId, amount) {
  const stack = new ItemStack(typeId, amount);
  const leftover = container.addItem(stack);
  if (!leftover) {
    return amount;
  }
  return amount - leftover.amount;
}

function sendMessage(player, message) {
  player.sendMessage(`§6[Orevintory]§r ${message}`);
}

function openOrevUi(player) {
  const data = loadOreData(player);
  const form = new ActionFormData();
  form.title("Orevintory");
  let body = "Metal ores stored:";
  for (const typeId of ORE_IDS) {
    const count = Number(data[typeId] || 0);
    if (count > 0) {
      body += `\n- ${ORE_CONFIG[typeId].label}: ${count}`;
    }
  }
  form.body(body);
  form.button("Withdraw");
  form.button("Close");
  form.show(player).then((response) => {
    if (response.canceled || response.selection !== 0) {
      return;
    }
    openWithdrawUi(player);
  });
}

function openWithdrawUi(player) {
  const data = loadOreData(player);
  const options = ORE_IDS.filter((typeId) => Number(data[typeId] || 0) > 0);
  if (options.length === 0) {
    sendMessage(player, "You have no stored ores to withdraw.");
    return;
  }
  const amounts = [1, 16, 64];
  const form = new ModalFormData();
  form.title("Withdraw from Orevintory");
  form.dropdown(
    "Ore Type",
    options.map((id) => `${ORE_CONFIG[id].label} (${data[id]})`),
    0
  );
  form.dropdown("Amount", amounts.map((a) => a.toString()), 0);
  form.show(player).then((response) => {
    if (response.canceled) {
      return;
    }
    const typeId = options[response.formValues[0]];
    const amount = amounts[response.formValues[1]];
    const available = getOreCount(player, typeId);
    if (available <= 0) {
      sendMessage(player, "Nothing to withdraw.");
      return;
    }
    const toWithdraw = Math.min(amount, available);
    const inventory = player.getComponent("inventory").container;
    if (!canAddItem(inventory, typeId, toWithdraw)) {
      sendMessage(player, "Not enough inventory space.");
      return;
    }
    const added = addItemToInventory(inventory, typeId, toWithdraw);
    if (added > 0) {
      removeOre(player, typeId, added);
      sendMessage(player, `Withdrew ${added} ${ORE_CONFIG[typeId].label}.`);
    } else {
      sendMessage(player, "Failed to withdraw items.");
    }
  });
}

function getSessionKey(player, block) {
  const loc = block.location;
  return `${getPlayerKey(player)}|${block.dimension.id}|${loc.x},${loc.y},${loc.z}`;
}

function setSession(player, block, oreId) {
  const key = getSessionKey(player, block);
  sessions.set(key, {
    playerId: getPlayerKey(player),
    dimensionId: block.dimension.id,
    location: { ...block.location },
    oreId,
    autoRefill: true,
    disabled: false,
    lastSeen: system.currentTick
  });
  return key;
}

function getSession(player, block) {
  return sessions.get(getSessionKey(player, block));
}

function clearSession(player, block) {
  sessions.delete(getSessionKey(player, block));
}

function isBlastAllowed(typeId) {
  return ORE_CONFIG[typeId]?.blast === true;
}

function getCompatibleOreIds(blockId) {
  if (blockId === "minecraft:blast_furnace") {
    return ORE_IDS.filter((id) => isBlastAllowed(id));
  }
  if (blockId === "minecraft:furnace") {
    return ORE_IDS;
  }
  return [];
}

function openFurnacePrompt(player, block) {
  const blockId = block.typeId;
  if (blockId === "minecraft:smoker") {
    sendMessage(player, "Smokers are not supported by Orevintory.");
    return;
  }
  const compatible = getCompatibleOreIds(blockId);
  const available = compatible.filter((id) => getOreCount(player, id) > 0);
  if (available.length === 0) {
    return;
  }
  const prompt = new ActionFormData();
  prompt.title("Orevintory");
  prompt.body("Smelt from Orevintory?");
  prompt.button("Select Ore");
  prompt.button("No");
  prompt.show(player).then((response) => {
    if (response.canceled || response.selection !== 0) {
      return;
    }
    openOreSelector(player, block, available);
  });
}

function openOreSelector(player, block, available) {
  const form = new ActionFormData();
  form.title("Select Ore Source");
  for (const id of available) {
    form.button(`${ORE_CONFIG[id].label} (${getOreCount(player, id)})`);
  }
  form.button("Disable Auto-Refill");
  form.button("Cancel");
  form.show(player).then((response) => {
    if (response.canceled) {
      return;
    }
    const selection = response.selection;
    if (selection === available.length) {
      const session = getSession(player, block);
      if (session) {
        session.disabled = true;
        session.autoRefill = false;
        sendMessage(player, "Auto-refill disabled for this furnace session.");
      }
      return;
    }
    if (selection === available.length + 1) {
      return;
    }
    const oreId = available[selection];
    setSession(player, block, oreId);
    injectOreIntoFurnace(player, block, oreId);
    sendMessage(player, `Smelting from ${ORE_CONFIG[oreId].label}.`);
  });
}

function injectOreIntoFurnace(player, block, oreId) {
  const container = block.getComponent("inventory").container;
  const inputSlot = container.getItem(0);
  const maxStack = new ItemStack(oreId, 1).maxAmount || 64;
  const available = getOreCount(player, oreId);
  if (available <= 0) {
    sendMessage(player, "No more ore in Orevintory.");
    return;
  }
  if (inputSlot && inputSlot.typeId !== oreId) {
    sendMessage(player, "Input slot has a different item.");
    return;
  }
  const current = inputSlot ? inputSlot.amount : 0;
  const space = Math.max(0, maxStack - current);
  if (space <= 0) {
    return;
  }
  const toMove = Math.min(space, available);
  const newAmount = current + toMove;
  const newStack = new ItemStack(oreId, newAmount);
  container.setItem(0, newStack);
  removeOre(player, oreId, toMove);
  const session = getSession(player, block);
  if (session) {
    session.lastSeen = system.currentTick;
  }
}

function tickRefill() {
  const now = system.currentTick;
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastSeen > SESSION_TTL_TICKS) {
      sessions.delete(key);
      continue;
    }
    const player = world.getAllPlayers().find((p) => p.id === session.playerId);
    if (!player) {
      sessions.delete(key);
      continue;
    }
    const dimension = world.getDimension(session.dimensionId);
    const block = dimension.getBlock(session.location);
    if (!block || block.typeId === "minecraft:air") {
      sessions.delete(key);
      continue;
    }
    if (!session.autoRefill || session.disabled) {
      continue;
    }
    const container = block.getComponent("inventory")?.container;
    if (!container) {
      continue;
    }
    const inputSlot = container.getItem(0);
    if (!inputSlot) {
      injectOreIntoFurnace(player, block, session.oreId);
      continue;
    }
    if (inputSlot.typeId !== session.oreId) {
      continue;
    }
    const maxStack = inputSlot.maxAmount || 64;
    if (inputSlot.amount >= maxStack) {
      continue;
    }
    injectOreIntoFurnace(player, block, session.oreId);
  }
}

function handlePickup(event) {
  const player = event.player;
  const item = event.itemStack;
  if (!item || !ORE_CONFIG[item.typeId]) {
    return;
  }
  const inventory = player.getComponent("inventory").container;
  const total = countInventoryItems(inventory, item.typeId);
  if (total < item.amount) {
    return;
  }
  const removed = removeInventoryItems(inventory, item.typeId, item.amount);
  if (removed > 0) {
    addOre(player, item.typeId, removed);
    sendMessage(player, `Stored ${removed} ${ORE_CONFIG[item.typeId].label}.`);
  }
}

world.afterEvents.worldInitialize.subscribe((event) => {
  const definition = new DynamicPropertiesDefinition();
  definition.defineString(OREV_PROPERTY, 8192);
  definition.defineNumber(OREV_VERSION);
  event.propertyRegistry.registerPlayerDynamicProperties(definition);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  const player = event.player;
  const version = player.getDynamicProperty(OREV_VERSION);
  if (typeof version !== "number") {
    player.setDynamicProperty(OREV_VERSION, OREV_VERSION_NUMBER);
    player.setDynamicProperty(OREV_PROPERTY, "{}");
  }
});

world.afterEvents.playerPickupItem.subscribe(handlePickup);

world.beforeEvents.chatSend.subscribe((event) => {
  if (event.message.trim() !== "/orev") {
    return;
  }
  event.cancel = true;
  openOrevUi(event.sender);
});

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  const block = event.block;
  if (!block) {
    return;
  }
  if (block.typeId === "minecraft:furnace" || block.typeId === "minecraft:blast_furnace" || block.typeId === "minecraft:smoker") {
    system.run(() => openFurnacePrompt(event.player, block));
  }
});

system.runInterval(tickRefill, AUTO_REFILL_INTERVAL);
