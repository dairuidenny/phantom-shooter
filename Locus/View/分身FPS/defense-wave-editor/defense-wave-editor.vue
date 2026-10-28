<view>
{ "name": "守护尖塔波次配置", "icon": "Swords", "displayPath": "游戏配置" }
</view>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { BaseButton } from "@locus/components";
import { readFile, writeFile } from "node:fs/promises";

type EnemyId = "a" | "b" | "c" | "d";
type EnemyShape = "capsule" | "sphere";

interface EnemyDefinition {
  id: EnemyId;
  label: string;
  shape: EnemyShape;
  width: number;
  height: number;
  speed: number;
  health: number;
  towerDamage: number;
  killChargeReward: number | null;
}

interface EnemySpawnConfig {
  enemyType: EnemyId;
  count: number;
}

interface SpawnPointConfig {
  hour: number;
  delaySeconds: number;
  enemies: EnemySpawnConfig[];
}

interface WaveConfig {
  spawnPoints: SpawnPointConfig[];
}

interface DefenseConfig {
  enemies: Record<EnemyId, EnemyDefinition>;
  waves: WaveConfig[];
}

const CONFIG_PATH = "src/defense-config.ts";
const START_MARKER = "/* DEFENSE_CONFIG_DATA_START */";
const END_MARKER = "/* DEFENSE_CONFIG_DATA_END */";
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const ENEMY_IDS: EnemyId[] = ["a", "b", "c", "d"];
const config = ref<DefenseConfig>(createEmptyConfig());
const currentWaveIndex = ref(0);
const baseline = ref("");
const loadedSourceData = ref("");
const status = ref("正在载入配置…");
const error = ref("");
const busy = ref(false);

const currentWave = computed(() => config.value.waves[currentWaveIndex.value]);
const dirty = computed(() => JSON.stringify(config.value) !== baseline.value);
const totalEnemies = computed(() => {
  if (!currentWave.value) return 0;
  return currentWave.value.spawnPoints.reduce(
    (total, point) => total + point.enemies.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    0,
  );
});

function createDefaultEnemies(): Record<EnemyId, EnemyDefinition> {
  return {
    a: { id: "a", label: "敌人A", shape: "capsule", width: 0.72, height: 1.76, speed: 2, health: 15, towerDamage: 10, killChargeReward: null },
    b: { id: "b", label: "敌人B", shape: "capsule", width: 2.16, height: 3.52, speed: 1.6, health: 300, towerDamage: 30, killChargeReward: null },
    c: { id: "c", label: "敌人C", shape: "sphere", width: 1.056, height: 1.056, speed: 5.2, health: 9, towerDamage: 10, killChargeReward: null },
    d: { id: "d", label: "护盾", shape: "capsule", width: 0.72, height: 3.52, speed: 3, health: 15, towerDamage: 10, killChargeReward: null },
  };
}

function createEmptyWave(): WaveConfig {
  return {
    spawnPoints: HOURS.map((hour) => ({ hour, delaySeconds: 0, enemies: [] })),
  };
}

function createEmptyConfig(): DefenseConfig {
  return { enemies: createDefaultEnemies(), waves: [createEmptyWave()] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function optionalNumberFromInput(event: Event): number | null {
  const value = (event.target as HTMLInputElement).value;
  return value === "" ? null : Number(value);
}

function normalizeConfig(value: any): DefenseConfig {
  const defaults = createDefaultEnemies();
  const enemies = {} as Record<EnemyId, EnemyDefinition>;
  for (const id of ENEMY_IDS) {
    enemies[id] = { ...defaults[id], ...(value?.enemies?.[id] ?? {}), id };
  }
  const sourceWaves = Array.isArray(value?.waves) && value.waves.length > 0
    ? value.waves
    : [createEmptyWave()];
  const waves = sourceWaves.map((sourceWave: any) => {
    const points = Array.isArray(sourceWave?.spawnPoints) ? sourceWave.spawnPoints : [];
    return {
      spawnPoints: HOURS.map((hour) => {
        const sourcePoint = points.find((point: any) => Number(point?.hour) === hour);
        const rows = Array.isArray(sourcePoint?.enemies) ? sourcePoint.enemies : [];
        return {
          hour,
          delaySeconds: Number(sourcePoint?.delaySeconds ?? 0),
          enemies: rows.map((row: any) => ({
            enemyType: ENEMY_IDS.includes(row?.enemyType) ? row.enemyType : "a",
            count: Number(row?.count ?? 1),
          })),
        };
      }),
    };
  });
  return { enemies, waves };
}

function extractData(source: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("配置文件缺少数据标记，无法安全读写。");
  }
  return source.slice(start + START_MARKER.length, end).trim();
}

function replaceData(source: string, data: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("配置文件缺少数据标记，无法安全读写。");
  }
  const dataStart = start + START_MARKER.length;
  return source.slice(0, dataStart) + "\n" + data + "\n" + source.slice(end);
}

function validateConfig(value: DefenseConfig): void {
  if (!Array.isArray(value.waves) || value.waves.length === 0) {
    throw new Error("至少需要配置一波敌人。");
  }
  for (const id of ENEMY_IDS) {
    const enemy = value.enemies[id];
    if (!enemy || !enemy.label.trim()) throw new Error("敌人 " + id.toUpperCase() + " 缺少名称。");
    if (enemy.shape !== "capsule" && enemy.shape !== "sphere") {
      throw new Error(enemy.label + " 的形状无效。");
    }
    for (const [name, number, allowZero] of [
      ["宽度", enemy.width, false],
      ["高度", enemy.height, false],
      ["移速", enemy.speed, false],
      ["血量", enemy.health, false],
      ["对塔攻击力", enemy.towerDamage, true],
    ] as Array<[string, number, boolean]>) {
      if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
        throw new Error(enemy.label + " 的" + name + "必须是" + (allowZero ? "非负数" : "正数") + "。");
      }
    }
    if (enemy.killChargeReward !== null && (!Number.isInteger(enemy.killChargeReward) || enemy.killChargeReward < 0)) {
      throw new Error(enemy.label + " 的击杀奖励充能必须留空或填写非负整数。");
    }
    if (enemy.shape === "capsule" && enemy.height < enemy.width) {
      throw new Error(enemy.label + " 的胶囊体高度不能小于宽度。");
    }
  }
  value.waves.forEach((wave, waveIndex) => {
    if (wave.spawnPoints.length !== 12) throw new Error("第 " + (waveIndex + 1) + " 波缺少刷新点。");
    let waveEnemyCount = 0;
    wave.spawnPoints.forEach((point) => {
      if (!Number.isFinite(point.delaySeconds) || point.delaySeconds < 0) {
        throw new Error("第 " + (waveIndex + 1) + " 波 " + point.hour + " 号点的延迟必须是非负数。");
      }
      point.enemies.forEach((row) => {
        if (!ENEMY_IDS.includes(row.enemyType)) throw new Error("存在未知敌人类型。");
        if (!Number.isInteger(row.count) || row.count <= 0) {
          throw new Error("第 " + (waveIndex + 1) + " 波 " + point.hour + " 号点的敌人数量必须是正整数。");
        }
        waveEnemyCount += row.count;
      });
    });
    if (waveEnemyCount === 0) throw new Error("第 " + (waveIndex + 1) + " 波至少需要一个敌人。");
  });
}

async function loadConfig(force = false): Promise<void> {
  if (!force && dirty.value && !window.confirm("载入会丢弃尚未应用的修改，是否继续？")) return;
  busy.value = true;
  error.value = "";
  try {
    const source = await readFile(CONFIG_PATH, "utf8");
    const data = extractData(source);
    const loaded = normalizeConfig(JSON.parse(data));
    config.value = loaded;
    currentWaveIndex.value = Math.min(currentWaveIndex.value, loaded.waves.length - 1);
    baseline.value = JSON.stringify(loaded);
    loadedSourceData.value = data;
    status.value = "已载入 " + loaded.waves.length + " 波配置";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    status.value = "载入失败";
  } finally {
    busy.value = false;
  }
}

async function applyConfig(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    validateConfig(config.value);
    const source = await readFile(CONFIG_PATH, "utf8");
    const currentSourceData = extractData(source);
    if (loadedSourceData.value && currentSourceData !== loadedSourceData.value) {
      throw new Error("配置文件已在外部发生变化，请先载入配置后再应用。");
    }
    const data = JSON.stringify(config.value, null, 2);
    await writeFile(CONFIG_PATH, replaceData(source, data), "utf8");
    loadedSourceData.value = data;
    baseline.value = JSON.stringify(config.value);
    status.value = "配置已应用到 " + CONFIG_PATH;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    status.value = "应用失败";
  } finally {
    busy.value = false;
  }
}

function addWave(): void {
  const source = config.value.waves[config.value.waves.length - 1] ?? createEmptyWave();
  config.value.waves.push(clone(source));
  currentWaveIndex.value = config.value.waves.length - 1;
  status.value = "已新增第 " + config.value.waves.length + " 波（复制上一波）";
}

function removeLastWave(): void {
  if (config.value.waves.length <= 1) return;
  const number = config.value.waves.length;
  if (!window.confirm("删除第 " + number + " 波配置？之后波次将沿用新的最后一波。")) return;
  config.value.waves.pop();
  currentWaveIndex.value = Math.min(currentWaveIndex.value, config.value.waves.length - 1);
  status.value = "已删除第 " + number + " 波";
}

function addEnemyRow(point: SpawnPointConfig): void {
  point.enemies.push({ enemyType: "a", count: 1 });
}

function removeEnemyRow(point: SpawnPointConfig, rowIndex: number): void {
  point.enemies.splice(rowIndex, 1);
}

function pointStyle(hour: number): Record<string, string> {
  const angle = ((hour % 12) / 12) * Math.PI * 2;
  const radiusX = 40;
  const radiusY = 39;
  return {
    left: (50 + Math.sin(angle) * radiusX) + "%",
    top: (50 - Math.cos(angle) * radiusY) + "%",
  };
}

onMounted(() => void loadConfig(true));
</script>

<template>
  <main class="editor-shell">
    <header class="toolbar">
      <div class="wave-switcher">
        <span class="toolbar-label">波次</span>
        <button
          v-for="(_, index) in config.waves"
          :key="index"
          class="wave-tab"
          :class="{ active: currentWaveIndex === index }"
          type="button"
          @click="currentWaveIndex = index"
        >{{ index + 1 }}</button>
        <BaseButton :disabled="busy" @click="addWave">+ 新增波次</BaseButton>
        <BaseButton :disabled="busy || config.waves.length <= 1" @click="removeLastWave">删除末波</BaseButton>
        <span class="inherit-note">第 {{ config.waves.length + 1 }} 波起沿用第 {{ config.waves.length }} 波</span>
      </div>
      <div class="actions">
        <span class="state" :class="{ modified: dirty, failed: !!error }">{{ error || status }}</span>
        <BaseButton :disabled="busy" @click="loadConfig(false)">载入配置</BaseButton>
        <BaseButton :disabled="busy || !dirty" @click="applyConfig">应用配置</BaseButton>
      </div>
    </header>

    <section class="summary-bar">
      <strong>第 {{ currentWaveIndex + 1 }} 波</strong>
      <span>{{ totalEnemies }} 个敌人</span>
      <span>所有刷新点独立延迟，之后均以固定 10 个/秒生成</span>
    </section>

    <section class="arena-scroll">
      <div v-if="currentWave" class="arena">
        <div class="arena-disc"></div>
        <div class="spire">
          <span></span>
          <strong>中央尖塔</strong>
        </div>

        <article
          v-for="point in currentWave.spawnPoints"
          :key="point.hour"
          class="spawn-card"
          :class="{ configured: point.enemies.length > 0 }"
          :style="pointStyle(point.hour)"
        >
          <header>
            <strong>{{ point.hour }}号刷新点</strong>
            <label>延迟 <input v-model.number="point.delaySeconds" type="number" min="0" step="0.1" /> s</label>
          </header>
          <div class="enemy-rows">
            <div v-if="point.enemies.length === 0" class="empty-row">未配置敌人</div>
            <div v-for="(row, rowIndex) in point.enemies" :key="rowIndex" class="enemy-row">
              <select v-model="row.enemyType" aria-label="敌人类型">
                <option v-for="id in ENEMY_IDS" :key="id" :value="id">{{ config.enemies[id].label }}</option>
              </select>
              <input v-model.number="row.count" aria-label="敌人数量" type="number" min="1" step="1" />
              <button class="delete-row" type="button" title="删除" @click="removeEnemyRow(point, rowIndex)">×</button>
            </div>
          </div>
          <button class="add-row" type="button" @click="addEnemyRow(point)">＋ 添加敌人</button>
        </article>
      </div>
    </section>

    <section class="enemy-config">
      <header>
        <div>
          <h2>敌人配置</h2>
          <p>宽高单位为米，移速单位为米/秒；击杀奖励留空时按0处理。应用后游戏直接读取这些数值。</p>
        </div>
      </header>
      <div class="enemy-table">
        <div class="enemy-table-head">
          <span>敌人</span><span>形状</span><span>宽度</span><span>高度</span><span>移速</span><span>血量</span><span>对塔攻击力</span><span>击杀奖励充能</span>
        </div>
        <div v-for="id in ENEMY_IDS" :key="id" class="enemy-table-row">
          <input v-model="config.enemies[id].label" aria-label="敌人名称" />
          <select v-model="config.enemies[id].shape" aria-label="敌人形状">
            <option value="capsule">胶囊体</option>
            <option value="sphere">球体</option>
          </select>
          <label><input v-model.number="config.enemies[id].width" type="number" min="0.01" step="0.01" /><i>m</i></label>
          <label><input v-model.number="config.enemies[id].height" type="number" min="0.01" step="0.01" /><i>m</i></label>
          <label><input v-model.number="config.enemies[id].speed" type="number" min="0.01" step="0.1" /><i>m/s</i></label>
          <input v-model.number="config.enemies[id].health" aria-label="敌人血量" type="number" min="0.01" step="1" />
          <input v-model.number="config.enemies[id].towerDamage" aria-label="对塔攻击力" type="number" min="0" step="1" />
          <input :value="config.enemies[id].killChargeReward ?? ''" aria-label="击杀奖励充能" type="number" min="0" step="1" placeholder="留空" @input="config.enemies[id].killChargeReward = optionalNumberFromInput($event)" />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.editor-shell {
  min-height: 100%;
  color: var(--text-color, #d8dde5);
  background: var(--background-color, #181a1f);
  font-size: 12px;
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 44px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-color, #343840);
  background: var(--background-color, #181a1f);
}
.wave-switcher, .actions { display: flex; align-items: center; gap: 6px; }
.toolbar-label { color: var(--text-secondary, #89919d); margin-right: 2px; }
.wave-tab {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-color, #3a3e47);
  border-radius: 3px;
  color: inherit;
  background: var(--panel-color, #24272e);
  cursor: pointer;
}
.wave-tab.active { border-color: var(--accent-color, #4aa3ff); color: #fff; background: #245c8f; }
.inherit-note, .state { color: var(--text-secondary, #9299a4); white-space: nowrap; }
.state.modified { color: #e5b85c; }
.state.failed { color: #ff7777; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
.summary-bar {
  height: 34px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--border-color, #343840);
  color: var(--text-secondary, #9ba3af);
}
.summary-bar strong { color: var(--text-color, #e5e8ec); }
.arena-scroll { overflow: auto; border-bottom: 1px solid var(--border-color, #343840); }
.arena {
  position: relative;
  width: 1180px;
  height: 900px;
  margin: 0 auto;
  overflow: hidden;
  background-color: #1c2024;
  background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
  background-size: 32px 32px;
}
.arena-disc {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 650px;
  height: 650px;
  transform: translate(-50%, -50%);
  border: 2px solid #8d3138;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(44,51,58,.8), rgba(28,32,36,.12) 67%, transparent 68%);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
}
.spire {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #3989ba;
  border-radius: 50%;
  background: #202b32;
  color: #bce8ff;
}
.spire span { width: 20px; height: 32px; transform: rotate(45deg); border: 2px solid #59b9ec; background: #253e4b; }
.spawn-card {
  position: absolute;
  width: 188px;
  min-height: 106px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-color, #424750);
  border-radius: 4px;
  background: rgba(31, 34, 40, .96);
  box-shadow: 0 2px 8px rgba(0,0,0,.28);
}
.spawn-card.configured { border-color: #9e3e45; }
.spawn-card > header {
  min-height: 30px;
  padding: 4px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  border-bottom: 1px solid var(--border-color, #393e47);
}
.spawn-card > header strong { color: #f1b2b6; white-space: nowrap; }
.spawn-card > header label { display: flex; align-items: center; gap: 3px; color: var(--text-secondary, #9ca3ad); white-space: nowrap; }
.spawn-card > header input { width: 42px; }
.enemy-rows { max-height: 92px; overflow-y: auto; padding: 4px 5px; }
.enemy-row { display: grid; grid-template-columns: 1fr 42px 20px; gap: 4px; margin-bottom: 3px; }
.empty-row { padding: 8px 4px; text-align: center; color: var(--text-secondary, #7f8792); }
input, select {
  min-width: 0;
  height: 23px;
  box-sizing: border-box;
  border: 1px solid var(--border-color, #454a54);
  border-radius: 2px;
  padding: 2px 5px;
  color: var(--text-color, #dde1e7);
  background: var(--input-background, #17191e);
  font: inherit;
}
input:focus, select:focus { outline: 1px solid var(--accent-color, #4aa3ff); border-color: var(--accent-color, #4aa3ff); }
.delete-row, .add-row {
  border: 0;
  color: var(--text-secondary, #a5acb5);
  background: transparent;
  cursor: pointer;
}
.delete-row:hover { color: #ff7e7e; }
.add-row { width: 100%; height: 26px; border-top: 1px solid var(--border-color, #383d45); }
.add-row:hover { color: #fff; background: rgba(255,255,255,.04); }
.enemy-config { padding: 12px 14px 24px; }
.enemy-config > header { display: flex; align-items: end; justify-content: space-between; margin-bottom: 8px; }
h2 { margin: 0 0 3px; font-size: 14px; }
p { margin: 0; color: var(--text-secondary, #949ba6); }
.enemy-table { min-width: 980px; border: 1px solid var(--border-color, #383d45); border-radius: 4px; overflow: hidden; }
.enemy-table-head, .enemy-table-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr repeat(6, 1fr);
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
}
.enemy-table-head { color: var(--text-secondary, #979fab); background: var(--panel-color, #25282f); border-bottom: 1px solid var(--border-color, #3b4049); }
.enemy-table-row { border-bottom: 1px solid var(--border-color, #32363e); }
.enemy-table-row:last-child { border-bottom: 0; }
.enemy-table-row label { position: relative; }
.enemy-table-row label input { width: 100%; padding-right: 30px; }
.enemy-table-row label i { position: absolute; right: 6px; top: 4px; color: var(--text-secondary, #7f8791); font-style: normal; pointer-events: none; }
</style>
