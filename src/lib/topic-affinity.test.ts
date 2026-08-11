import { describe, expect, it } from "vitest";
import { CODEFUN_PROBLEMS } from "./codefun-problems";
import { NOWCODER_TOPIC_GROUPS } from "./nowcoder-problems";
import { hot100TopicsForAcmTopics, HOT100_TOPICS_FOR_ACM_TOPIC } from "./topic-affinity";
import { TOPIC_GROUPS } from "./topics";

const HOT100_NAMES = new Set(TOPIC_GROUPS.map((group) => group.name));

describe("HOT100_TOPICS_FOR_ACM_TOPIC", () => {
  it("只映射到真实存在的 Hot100 分类", () => {
    for (const [acmTopic, hot100Topics] of Object.entries(HOT100_TOPICS_FOR_ACM_TOPIC)) {
      for (const name of hot100Topics) {
        expect(HOT100_NAMES, `${acmTopic} → ${name}`).toContain(name);
      }
    }
  });

  it("覆盖速成题单的每一个分类", () => {
    const topics = new Set(CODEFUN_PROBLEMS.map(([, , category]) => category));
    for (const topic of topics) {
      expect(HOT100_TOPICS_FOR_ACM_TOPIC, topic).toHaveProperty(topic);
    }
  });

  it("覆盖牛客的每一个分类", () => {
    for (const group of NOWCODER_TOPIC_GROUPS) {
      expect(HOT100_TOPICS_FOR_ACM_TOPIC, group.name).toHaveProperty(group.name);
    }
  });
});

describe("hot100TopicsForAcmTopics", () => {
  it("按相关度排序，最贴的分类在前", () => {
    expect(hot100TopicsForAcmTopics(["动态规划"])).toEqual(["动态规划", "多维动态规划"]);
  });

  it("合并一天的多个考点，去重", () => {
    const ranked = hot100TopicsForAcmTopics(["动态规划", "贪心"]);
    expect(ranked).toContain("动态规划");
    expect(ranked).toContain("贪心算法");
    expect(new Set(ranked).size).toBe(ranked.length);
  });

  it("一个分类取它在所有考点里的最好名次", () => {
    // 图论 对 BFS 是首选(0)、对 DFS 是第三选(2) —— 取 0，排在 二叉树 前面。
    expect(hot100TopicsForAcmTopics(["DFS", "BFS"])[0]).toBe("回溯");
    const ranked = hot100TopicsForAcmTopics(["DFS", "BFS"]);
    expect(ranked.indexOf("图论")).toBeLessThan(ranked.indexOf("二叉树"));
  });

  it("忽略没有映射的考点", () => {
    expect(hot100TopicsForAcmTopics(["压根不存在的分类"])).toEqual([]);
  });
});
