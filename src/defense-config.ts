// This file is managed by the Defense Wave Editor View.
// Keep the data markers intact so the View can load and apply configuration safely.

export type EnemyId = 'a' | 'b' | 'c' | 'd';
export type EnemyShape = 'capsule' | 'sphere';

export interface EnemyDefinition {
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

export interface EnemySpawnConfig {
  enemyType: EnemyId;
  count: number;
}

export interface SpawnPointConfig {
  hour: number;
  delaySeconds: number;
  enemies: EnemySpawnConfig[];
}

export interface WaveConfig {
  spawnPoints: SpawnPointConfig[];
}

export interface DefenseConfig {
  enemies: Record<EnemyId, EnemyDefinition>;
  waves: WaveConfig[];
}

export const DEFENSE_CONFIG: DefenseConfig =
/* DEFENSE_CONFIG_DATA_START */
{
  "enemies": {
    "a": {
      "id": "a",
      "label": "普通",
      "shape": "capsule",
      "width": 0.72,
      "height": 1.76,
      "speed": 2,
      "health": 15,
      "towerDamage": 10,
      "killChargeReward": 0
    },
    "b": {
      "id": "b",
      "label": "重甲",
      "shape": "capsule",
      "width": 2.16,
      "height": 3.52,
      "speed": 1.6,
      "health": 300,
      "towerDamage": 30,
      "killChargeReward": 20
    },
    "c": {
      "id": "c",
      "label": "高速",
      "shape": "sphere",
      "width": 1.056,
      "height": 1.056,
      "speed": 5.2,
      "health": 9,
      "towerDamage": 10,
      "killChargeReward": 0
    },
    "d": {
      "id": "d",
      "label": "护盾",
      "shape": "capsule",
      "width": 0.72,
      "height": 3.52,
      "speed": 2,
      "health": 25,
      "towerDamage": 10,
      "killChargeReward": 10
    }
  },
  "waves": [
    {
      "spawnPoints": [
        {
          "hour": 1,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            }
          ]
        },
        {
          "hour": 2,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 3,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 4,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 5,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 6,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 7,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 8,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 9,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 10,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 11,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            }
          ]
        },
        {
          "hour": 12,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            }
          ]
        }
      ]
    },
    {
      "spawnPoints": [
        {
          "hour": 1,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            }
          ]
        },
        {
          "hour": 2,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 3,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 4,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 5,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 6,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 7,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 8,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 9,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 10,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 11,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            }
          ]
        },
        {
          "hour": 12,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            },
            {
              "enemyType": "b",
              "count": 1
            }
          ]
        }
      ]
    },
    {
      "spawnPoints": [
        {
          "hour": 1,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            },
            {
              "enemyType": "b",
              "count": 1
            },
            {
              "enemyType": "c",
              "count": 2
            }
          ]
        },
        {
          "hour": 2,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 3,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 4,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 5,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 6,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 7,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 8,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 9,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 10,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 11,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            },
            {
              "enemyType": "b",
              "count": 1
            },
            {
              "enemyType": "c",
              "count": 2
            }
          ]
        },
        {
          "hour": 12,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "a",
              "count": 10
            },
            {
              "enemyType": "b",
              "count": 1
            }
          ]
        }
      ]
    },
    {
      "spawnPoints": [
        {
          "hour": 1,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 2,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 3,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 4,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 5,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 6,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 7,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 8,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 9,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 10,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 11,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 12,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "d",
              "count": 1
            },
            {
              "enemyType": "a",
              "count": 15
            }
          ]
        }
      ]
    },
    {
      "spawnPoints": [
        {
          "hour": 1,
          "delaySeconds": 5,
          "enemies": [
            {
              "enemyType": "d",
              "count": 1
            },
            {
              "enemyType": "b",
              "count": 1
            }
          ]
        },
        {
          "hour": 2,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 3,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 4,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 5,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 6,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 7,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 8,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 9,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 10,
          "delaySeconds": 0,
          "enemies": []
        },
        {
          "hour": 11,
          "delaySeconds": 5,
          "enemies": [
            {
              "enemyType": "d",
              "count": 1
            },
            {
              "enemyType": "b",
              "count": 1
            }
          ]
        },
        {
          "hour": 12,
          "delaySeconds": 0,
          "enemies": [
            {
              "enemyType": "c",
              "count": 15
            }
          ]
        }
      ]
    }
  ]
}
/* DEFENSE_CONFIG_DATA_END */;
