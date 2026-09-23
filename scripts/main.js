const MOD = "chat-item-importer";

const ICONS = {
  loot: "icons/svg/item-bag.svg",
  weapon: "icons/weapons/swords/sword-guard.webp",
  equipment: "icons/equipment/chest/breastplate-layered-steel.webp",
  consumable: "icons/consumables/potions/bottle-round-corked-red.webp",
  spell: "icons/magic/symbols/runes-star-pentagon-orange.webp",
  tool: "icons/tools/hand/hammer-cobbler-steel.webp",
  container: "icons/containers/chest/chest-reinforced-steel-brown.webp",
  feat: "icons/skills/trades/academics-book-study-runes.webp"
};

const PHYSICAL_ITEM_TYPES = new Set(["weapon", "equipment", "consumable", "loot", "tool", "container"]);

Hooks.on("renderItemDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".chat-item-importer-btn")) return;
  const controls = root.querySelector(".header-actions, .directory-header .action-buttons, .directory-header");
  if (!controls) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chat-item-importer-btn";
  btn.innerHTML = '<i class="fas fa-file-import"></i> Импорт предметов';
  btn.addEventListener("click", openImporter);
  controls.append(btn);
});

async function openImporter() {
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: "Импорт предметов" },
    content: `<div class="cii-dialog">
      <p>Вставьте JSON предмета или массив предметов, который я подготовлю в чате.</p>
      <textarea name="payload" rows="18" placeholder='[{"name":"Кабаний клык","type":"loot","price":{"value":3,"denomination":"sp"},"weight":0.2,"rarity":"common","description":"..."}]'></textarea>
    </div>`,
    ok: { label: "Импортировать", icon: "fas fa-file-import" },
    rejectClose: false,
    modal: true
  });
  if (!result?.payload) return;
  try {
    const parsed = JSON.parse(result.payload);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const docs = entries.map(normalizeItem);
    const created = await Item.createDocuments(docs);
    ui.notifications.info(`Импортировано предметов: ${created.length}`);
  } catch (err) {
    console.error(`${MOD} | import error`, err);
    ui.notifications.error(`Ошибка импорта: ${err.message}`);
  }
}

function normalizeItem(src) {
  if (!src?.name) throw new Error("У предмета отсутствует name");

  const type = mapType(src.type);
  const description = src.description ?? src.system?.description?.value ?? "";
  const system = foundry.utils.deepClone(src.system ?? {});
  system.description = { ...(system.description ?? {}), value: description };

  if (PHYSICAL_ITEM_TYPES.has(type)) {
    const price = normalizePrice(src.price ?? system.price, src.currency);
    const raritySource = src.rarities ?? src.rarity ?? system.rarities ?? system.rarity;

    system.quantity ??= 1;
    system.weight = normalizeWeight(src.weight ?? system.weight);
    system.price = { ...(system.price ?? {}), value: price.value, denomination: price.denomination };
    system.rarities = normalizeRarities(raritySource);
    delete system.rarity;
  }

  if (type === "loot") system.type ??= { value: "other", subtype: "" };

  return {
    name: src.name,
    type,
    img: src.img || ICONS[type] || "icons/svg/item-bag.svg",
    system,
    flags: { ...(src.flags ?? {}), [MOD]: { imported: true } }
  };
}

function mapType(value) {
  const v = String(value ?? "loot").trim().toLowerCase();
  const aliases = {
    "добыча": "loot", "loot": "loot",
    "оружие": "weapon", "weapon": "weapon",
    "экипировка": "equipment", "снаряжение": "equipment", "equipment": "equipment", "armor": "equipment",
    "расходный предмет": "consumable", "расходник": "consumable", "consumable": "consumable",
    "заклинание": "spell", "spell": "spell",
    "инструмент": "tool", "tool": "tool",
    "контейнер": "container", "container": "container",
    "черта": "feat", "feat": "feat"
  };
  const type = aliases[v] ?? v;
  const allowed = new Set(["loot", "weapon", "equipment", "consumable", "spell", "tool", "container", "feat"]);
  return allowed.has(type) ? type : "loot";
}

function normalizePrice(p, currency) {
  const explicitCurrency = normalizeDenomination(currency);
  if (typeof p === "number") return { value: p, denomination: explicitCurrency ?? "gp" };
  if (typeof p === "string") {
    const m = p.trim().match(/^([\d.,]+)\s*(cp|sp|ep|gp|pp)$/i);
    if (m) return { value: Number(m[1].replace(",", ".")), denomination: m[2].toLowerCase() };
  }
  return {
    value: Number(p?.value ?? 0),
    denomination: normalizeDenomination(p?.denomination) ?? explicitCurrency ?? "gp"
  };
}

function normalizeWeight(weight) {
  const value = Number(weight?.value ?? weight ?? 0);
  const configuredUnits = weight?.units;
  const metric = game.settings.get("dnd5e", "metricWeightUnits");
  const defaultUnits = CONFIG.DND5E.defaultUnits?.weight?.[metric ? "metric" : "imperial"] ?? (metric ? "kg" : "lb");
  return {
    value: Number.isFinite(value) ? Math.max(0, value) : 0,
    units: configuredUnits || defaultUnits
  };
}

function normalizeDenomination(value) {
  if (value == null || value === "") return null;
  const v = String(value).trim().toLowerCase();
  const aliases = {
    "мм": "cp", "медь": "cp", "медная": "cp", "cp": "cp",
    "см": "sp", "серебро": "sp", "серебряная": "sp", "sp": "sp",
    "эм": "ep", "электрум": "ep", "ep": "ep",
    "зм": "gp", "золото": "gp", "золотая": "gp", "gp": "gp",
    "пм": "pp", "платина": "pp", "pp": "pp"
  };
  return aliases[v] ?? (["cp", "sp", "ep", "gp", "pp"].includes(v) ? v : null);
}

function normalizeRarities(value) {
  const list = Array.isArray(value) || value instanceof Set ? [...value] : [value ?? "common"];
  return [...new Set(list.map(normalizeRarity).filter(Boolean))];
}

function normalizeRarity(r) {
  const v = String(r ?? "common").trim();
  const lower = v.toLowerCase();
  return ({
    "обычный": "common",
    "необычный": "uncommon",
    "редкий": "rare",
    "очень редкий": "veryRare",
    "легендарный": "legendary",
    "артефакт": "artifact",
    "veryrare": "veryRare"
  })[lower] ?? v;
}
