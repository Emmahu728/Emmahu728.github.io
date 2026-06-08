const API_URL = (window.SURVEY_API_URL || "").trim();

const rolloutMethods = [
  "通过配置中心推全",
  "launch层推全",
  "代码推全",
  "尚未推全"
];

const launchLayerKinds = [
  "原本的launch层推全",
  "新建的launch层推全"
];

const configCenterMigrationOptions = [
  "可以迁移到配置中心",
  "不能迁移"
];

const lookupPanel = document.querySelector("#lookupPanel");
const lookupForm = document.querySelector("#lookupForm");
const creatorInput = document.querySelector("#creatorInput");
const form = document.querySelector("#surveyForm");
const ownerBadge = document.querySelector("#ownerBadge");
const messageBox = document.querySelector("#messageBox");
const submitBar = document.querySelector("#submitBar");
const progressText = document.querySelector("#progressText");
const toast = document.querySelector("#toast");

let currentCreator = "";
let experiments = [];

function showMessage(message) {
  messageBox.textContent = message;
  messageBox.hidden = false;
}

function hideMessage() {
  messageBox.hidden = true;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

function jsonp(params) {
  return new Promise((resolve, reject) => {
    if (!API_URL || API_URL.includes("PASTE_GOOGLE_APPS_SCRIPT")) {
      reject(new Error("页面还没有配置 Google Apps Script Web App URL"));
      return;
    }

    const callbackName = `surveyCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(API_URL);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("callback", callbackName);

    window[callbackName] = (data) => {
      delete window[callbackName];
      script.remove();
      if (data?.ok === false) {
        reject(new Error(data.error || "请求失败"));
      } else {
        resolve(data);
      }
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error("无法连接数据服务"));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function postToAppsScript(payload) {
  return new Promise((resolve, reject) => {
    const iframeName = `submitFrame_${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.hidden = true;

    const submitForm = document.createElement("form");
    submitForm.method = "POST";
    submitForm.action = API_URL;
    submitForm.target = iframeName;
    submitForm.hidden = true;

    const input = document.createElement("input");
    input.name = "payload";
    input.value = JSON.stringify(payload);
    submitForm.appendChild(input);

    let submitted = false;
    iframe.onload = () => {
      if (!submitted) return;
      iframe.remove();
      submitForm.remove();
      resolve();
    };
    iframe.onerror = () => {
      iframe.remove();
      submitForm.remove();
      reject(new Error("提交失败"));
    };

    document.body.appendChild(iframe);
    document.body.appendChild(submitForm);
    submitted = true;
    submitForm.submit();
  });
}

function renderExperiment(experiment, index) {
  const selectedMethod = experiment.response?.rolloutMethod || "";
  const selectedKind = experiment.response?.launchLayerKind || "";
  const selectedMigration = experiment.response?.configCenterMigration || "";
  const migrationReason = experiment.response?.configCenterMigrationReason || "";
  const reverseCurrentFlow = experiment.response?.reverseCurrentFlow || "";
  const reversePassJudgement = experiment.response?.reversePassJudgement || "";
  const methodOptions = rolloutMethods.map((method) => `
    <label class="option">
      <input type="radio" name="method-${experiment.id}" value="${method}" ${selectedMethod === method ? "checked" : ""} required>
      <span>${method}</span>
    </label>
  `).join("");
  const kindOptions = launchLayerKinds.map((kind) => `
    <label class="option">
      <input type="radio" name="kind-${experiment.id}" value="${kind}" ${selectedKind === kind ? "checked" : ""} ${selectedMethod === "launch层推全" ? "required" : ""}>
      <span>${kind}</span>
    </label>
  `).join("");
  const migrationOptions = configCenterMigrationOptions.map((option) => `
    <label class="option">
      <input type="radio" name="migration-${experiment.id}" value="${option}" ${selectedMigration === option ? "checked" : ""} ${selectedMethod === "launch层推全" ? "required" : ""}>
      <span>${option}</span>
    </label>
  `).join("");

  return `
    <article class="experiment-card" data-id="${experiment.id}">
      <h3>实验 ${index + 1}</h3>
      <div class="meta-grid">
        <div class="meta-item"><strong>实验链接：</strong><a href="${experiment.experimentLink}" target="_blank" rel="noreferrer">${experiment.experimentLink || "未提供"}</a></div>
        <div class="meta-item"><strong>实验创建人：</strong>${experiment.experimentCreator}</div>
        <div class="meta-item"><strong>LR ID：</strong>${experiment.lrId || "未提供"}</div>
        ${experiment.reverseFlightId ? `<div class="meta-item"><strong>反转实验：</strong><a href="${experiment.reverseLink}" target="_blank" rel="noreferrer">${experiment.reverseFlightId}</a></div>` : ""}
      </div>
      <label class="question-label">该实验的推全方式是：</label>
      <div class="option-grid">${methodOptions}</div>
      <div class="launch-kind ${selectedMethod === "launch层推全" ? "is-visible" : ""}" data-launch-kind="${experiment.id}">
        <label class="question-label">launch 层推全来源：</label>
        <div class="option-grid">${kindOptions}</div>
        <label class="question-label with-gap">如果当前用的是 launch 层，是否可以迁移到配置中心？</label>
        <div class="option-grid">${migrationOptions}</div>
        <div class="migration-reason ${selectedMigration === "不能迁移" ? "is-visible" : ""}" data-migration-reason="${experiment.id}">
          <label class="question-label with-gap">不能迁移的原因：</label>
          <textarea class="text-input" name="migrationReason-${experiment.id}" rows="3" placeholder="例如：配置中心不支持该粒度、依赖代码逻辑、需要复杂灰度条件等" ${selectedMigration === "不能迁移" ? "required" : "disabled"}>${migrationReason}</textarea>
        </div>
      </div>
      <div class="reverse-block ${experiment.reverseLink ? "is-visible" : ""}" data-reverse-block="${experiment.id}">
        <label class="question-label">当前用户反转流程是怎么样的？</label>
        <textarea class="text-input" name="reverseFlow-${experiment.id}" rows="3" placeholder="请描述当前反转流程" ${experiment.reverseLink ? "required" : ""}>${reverseCurrentFlow}</textarea>
        <label class="question-label with-gap">如何判断反转实验能否通过？</label>
        <textarea class="text-input" name="reverseJudgement-${experiment.id}" rows="3" placeholder="请描述判断口径、指标、验收方式或卡点" ${experiment.reverseLink ? "required" : ""}>${reversePassJudgement}</textarea>
      </div>
    </article>
  `;
}

function updateProgress() {
  const complete = experiments.filter((experiment) => {
    const method = form.elements[`method-${experiment.id}`]?.value;
    const kind = form.elements[`kind-${experiment.id}`]?.value;
    const migration = form.elements[`migration-${experiment.id}`]?.value;
    const migrationReason = form.elements[`migrationReason-${experiment.id}`]?.value.trim();
    const reverseFlow = form.elements[`reverseFlow-${experiment.id}`]?.value.trim();
    const reverseJudgement = form.elements[`reverseJudgement-${experiment.id}`]?.value.trim();
    const launchReady = method !== "launch层推全"
      || (kind && migration && (migration !== "不能迁移" || migrationReason));
    const reverseReady = !experiment.reverseLink
      || (reverseFlow && reverseJudgement);
    return method && launchReady && reverseReady;
  }).length;
  progressText.textContent = `已完成 ${complete} / ${experiments.length}`;
}

async function loadExperiments(creator) {
  hideMessage();
  ownerBadge.textContent = "加载中";
  lookupForm.querySelector("button").disabled = true;

  try {
    const data = await jsonp({ action: "lookup", creator });
    currentCreator = data.owner;
    experiments = data.experiments || [];

    if (!experiments.length) {
      showMessage("没有匹配到实验。请确认邮箱前缀是否和实验创建人一致。");
      ownerBadge.textContent = "无匹配实验";
      return;
    }

    lookupPanel.hidden = true;
    form.innerHTML = experiments.map(renderExperiment).join("");
    form.hidden = false;
    submitBar.hidden = false;
    ownerBadge.textContent = `${data.owner} · ${experiments.length} 个实验`;
    updateProgress();
  } catch (error) {
    showMessage(error.message);
    ownerBadge.textContent = "加载失败";
  } finally {
    lookupForm.querySelector("button").disabled = false;
  }
}

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const creator = creatorInput.value.trim();
  if (!creator) return;
  loadExperiments(creator);
});

form.addEventListener("change", (event) => {
  const input = event.target;
  if (input.name?.startsWith("migration-")) {
    const id = input.name.replace("migration-", "");
    const reason = form.elements[`migrationReason-${id}`];
    const reasonBlock = form.querySelector(`[data-migration-reason="${id}"]`);
    reason.required = input.value === "不能迁移";
    reason.disabled = input.value !== "不能迁移";
    reasonBlock.classList.toggle("is-visible", input.value === "不能迁移");
    if (input.value !== "不能迁移") reason.value = "";
    updateProgress();
    return;
  }

  if (!input.name?.startsWith("method-")) {
    updateProgress();
    return;
  }

  const id = input.name.replace("method-", "");
  const launchKind = form.querySelector(`[data-launch-kind="${id}"]`);
  const kindInputs = [...form.querySelectorAll(`input[name="kind-${id}"]`)];
  const migrationInputs = [...form.querySelectorAll(`input[name="migration-${id}"]`)];
  const migrationReason = form.elements[`migrationReason-${id}`];
  const migrationReasonBlock = form.querySelector(`[data-migration-reason="${id}"]`);

  if (input.value === "launch层推全") {
    launchKind.classList.add("is-visible");
    kindInputs.forEach((kindInput) => {
      kindInput.required = true;
    });
    migrationInputs.forEach((migrationInput) => {
      migrationInput.required = true;
    });
    migrationReason.required = form.elements[`migration-${id}`]?.value === "不能迁移";
    migrationReason.disabled = form.elements[`migration-${id}`]?.value !== "不能迁移";
    migrationReasonBlock.classList.toggle("is-visible", form.elements[`migration-${id}`]?.value === "不能迁移");
  } else {
    launchKind.classList.remove("is-visible");
    kindInputs.forEach((kindInput) => {
      kindInput.required = false;
      kindInput.checked = false;
    });
    migrationInputs.forEach((migrationInput) => {
      migrationInput.required = false;
      migrationInput.checked = false;
    });
    migrationReason.required = false;
    migrationReason.disabled = true;
    migrationReason.value = "";
    migrationReasonBlock.classList.remove("is-visible");
  }
  updateProgress();
});

form.addEventListener("input", updateProgress);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answers = experiments.map((experiment) => {
    const rolloutMethod = form.elements[`method-${experiment.id}`]?.value || "";
    const launchLayerKind = rolloutMethod === "launch层推全"
      ? form.elements[`kind-${experiment.id}`]?.value || ""
      : "";
    const configCenterMigration = rolloutMethod === "launch层推全"
      ? form.elements[`migration-${experiment.id}`]?.value || ""
      : "";
    const configCenterMigrationReason = rolloutMethod === "launch层推全"
      ? form.elements[`migrationReason-${experiment.id}`]?.value.trim() || ""
      : "";
    const reverseCurrentFlow = experiment.reverseLink
      ? form.elements[`reverseFlow-${experiment.id}`]?.value.trim() || ""
      : "";
    const reversePassJudgement = experiment.reverseLink
      ? form.elements[`reverseJudgement-${experiment.id}`]?.value.trim() || ""
      : "";
    return {
      experimentId: experiment.id,
      rolloutMethod,
      launchLayerKind,
      configCenterMigration,
      configCenterMigrationReason,
      reverseCurrentFlow,
      reversePassJudgement
    };
  });

  form.querySelector("button[type='submit']")?.setAttribute("disabled", "disabled");
  try {
    await postToAppsScript({
      action: "submit",
      creator: currentCreator,
      answers
    });
    showToast("已提交，感谢确认");
  } catch (error) {
    showMessage(error.message || "提交失败，请稍后再试");
  } finally {
    form.querySelector("button[type='submit']")?.removeAttribute("disabled");
  }
});

if (!API_URL || API_URL.includes("PASTE_GOOGLE_APPS_SCRIPT")) {
  showMessage("页面还没有配置 Google Apps Script Web App URL。请先完成部署配置。");
}
