const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const hooks = {};
const ctx = {
  Hooks: { on: (name, fn) => { hooks[name] = fn; } },
  foundry: { utils: { deepClone: data => JSON.parse(JSON.stringify(data)) } },
  game: { settings: { get: () => false } },
  CONFIG: { DND5E: { defaultUnits: { weight: { imperial: "lb" } } } }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("scripts/main.js", "utf8") + "\\nglobalThis.testNormalize = normalizeItem;", ctx);
const raw = {
  name: "Хищный наскок", type: "feat",
  system: { type: { value: "monster" }, activities: { pounceAttack0001: { type: "attack" } } },
  effects: [{ _id: "pounceProne00001", statuses: ["prone"] }],
  flags: { "lipatos-status-automation": { rules: { pounceSave000001: { trigger: "native" } } } }
};
const item = ctx.testNormalize(raw);
assert.equal(item.type, "feat");
assert.equal(item.effects[0]._id, "pounceProne00001");
assert.equal(item.system.activities.pounceAttack0001.type, "attack");
assert.equal(item.flags["lipatos-status-automation"].rules.pounceSave000001.trigger, "native");
assert.equal(item.flags["chat-item-importer"].imported, true);
assert.notEqual(item.effects, raw.effects, "effects must be cloned");
assert.throws(() => ctx.testNormalize({name:"Bad",type:"feat",effects:{}}), /effects/);
console.log("SMOKE TEST PASSED: feature activities, Active Effects, flags, validation.");
