const { TARGET_AMOUNT, optimizeOrders } = window.OrderOptimizer;

const fileInput = document.getElementById("excelFile");
const uploadZone = document.getElementById("uploadZone");
const fileStatus = document.getElementById("fileStatus");
const manualInput = document.getElementById("manualInput");
const targetAmountInput = document.getElementById("targetAmount");
const optimizeButton = document.getElementById("optimizeButton");
const useDemoButton = document.getElementById("useDemoButton");
const exportButton = document.getElementById("exportButton");
const randomButton = document.getElementById("randomButton");

const groupCount = document.getElementById("groupCount");
const groupedAmount = document.getElementById("groupedAmount");
const leftoverCount = document.getElementById("leftoverCount");
const leftoverAmount = document.getElementById("leftoverAmount");
const groupResults = document.getElementById("groupResults");
const leftoverResults = document.getElementById("leftoverResults");
const hasExcelEngine = typeof window.XLSX !== "undefined";

let uploadedAmounts = [];
let latestRun = null;

function buildDemoAmounts() {
  return [100, 180, 99, 2, 98, 3, 76, 24, 65, 35, 51, 49, 50, 50, 7];
}

function buildRandomAmounts() {
  const count = Math.floor(Math.random() * 10) + 16;
  const values = [];

  for (let index = 0; index < count; index += 1) {
    const roll = Math.random();

    if (roll < 0.14) {
      values.push(100);
    } else if (roll < 0.24) {
      values.push(Math.floor(Math.random() * 100) + 101);
    } else if (roll < 0.74) {
      values.push(Math.floor(Math.random() * 60) + 20);
    } else {
      values.push(Math.floor(Math.random() * 12) + 1);
    }
  }

  return values;
}

function tokenizeManualInput(rawText) {
  return rawText
    .replace(/[，、；]/g, ",")
    .split(/[\s,;\n\r\t,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseManualAmounts(rawText) {
  const tokens = tokenizeManualInput(rawText);
  const amounts = tokens.map(Number).filter((value) => Number.isFinite(value) && value > 0);

  return amounts.map((amount, index) => ({
    id: `MANUAL-${String(index + 1).padStart(3, "0")}`,
    amount: Math.round(amount * 100) / 100,
  }));
}

function parseExcelAmounts(rows) {
  if (!rows.length) {
    return [];
  }

  const firstRow = rows[0];
  const keys = Array.isArray(firstRow)
    ? firstRow.map((_, index) => index)
    : Object.keys(firstRow);

  let targetKey = keys[0];
  const keyMatch = keys.find((key) => {
    const normalized = String(key).toLowerCase();
    return normalized.includes("amount") || normalized.includes("金额");
  });

  if (keyMatch !== undefined) {
    targetKey = keyMatch;
  } else if (typeof firstRow === "object" && !Array.isArray(firstRow)) {
    const candidate = Object.keys(firstRow).find((key) => {
      const value = Number(firstRow[key]);
      return Number.isFinite(value);
    });

    if (candidate) {
      targetKey = candidate;
    }
  }

  return rows
    .map((row, index) => {
      const rawValue = row[targetKey];
      const amount = Number(rawValue);

      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        id: `EXCEL-${String(index + 1).padStart(3, "0")}`,
        amount: Math.round(amount * 100) / 100,
      };
    })
    .filter(Boolean);
}

function parseExcelMatrix(rows) {
  if (!rows.length) {
    return [];
  }

  const normalizedRows = rows
    .map((row) => (Array.isArray(row) ? row : []))
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));

  if (!normalizedRows.length) {
    return [];
  }

  const headerRow = normalizedRows[0];
  let amountColumnIndex = headerRow.findIndex((cell) => {
    const normalized = String(cell ?? "").trim().toLowerCase();
    return normalized.includes("amount") || normalized.includes("金额");
  });

  let startRowIndex = 1;

  if (amountColumnIndex === -1) {
    const numericColumnIndex = headerRow.findIndex((cell) => {
      const value = Number(cell);
      return Number.isFinite(value) && value > 0;
    });

    if (numericColumnIndex !== -1) {
      amountColumnIndex = numericColumnIndex;
      startRowIndex = 0;
    } else {
      amountColumnIndex = 0;
    }
  }

  return normalizedRows
    .slice(startRowIndex)
    .map((row, index) => {
      const amount = Number(row[amountColumnIndex]);

      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        id: `EXCEL-${String(index + 1).padStart(3, "0")}`,
        amount: Math.round(amount * 100) / 100,
      };
    })
    .filter(Boolean);
}

function getTargetAmount() {
  const value = Number(targetAmountInput.value);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : TARGET_AMOUNT;
}

function formatAmount(amount) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function renderNotice(container, message) {
  container.className = "result-list";
  container.innerHTML = `<div class="notice">${message}</div>`;
}

function renderEmpty(container, message) {
  container.className = "result-list empty-state";
  container.textContent = message;
}

function renderResults(result, targetAmount) {
  const totalGroupedAmount = result.groups.reduce(
    (sum, group) => sum + group.reduce((groupSum, item) => groupSum + item.amount, 0),
    0
  );
  const totalLeftoverAmount = result.leftovers.reduce((sum, item) => sum + item.amount, 0);

  groupCount.textContent = String(result.groups.length);
  groupedAmount.textContent = formatAmount(totalGroupedAmount);
  leftoverCount.textContent = String(result.leftovers.length);
  leftoverAmount.textContent = formatAmount(totalLeftoverAmount);

  if (!result.groups.length) {
    renderEmpty(groupResults, "没有形成任何满足条件的分组。");
  } else {
    groupResults.className = "result-list";
    groupResults.innerHTML = result.groups
      .map((group, index) => {
        const total = group.reduce((sum, item) => sum + item.amount, 0);
        const overflow = Math.round((total - targetAmount) * 100) / 100;
        const itemTags = group
          .map(
            (item) =>
              `<span class="item-tag"><span>${item.id}</span><strong>${formatAmount(item.amount)}</strong></span>`
          )
          .join("");

        return `
          <article class="group-card">
            <div class="group-head">
              <div class="group-title">第 ${index + 1} 组</div>
              <span class="pill good">总额 ${formatAmount(total)}</span>
            </div>
            <div class="item-list">${itemTags}</div>
            <div class="item-meta">目标值：${formatAmount(targetAmount)} ｜ 溢出金额：${formatAmount(overflow)}</div>
          </article>
        `;
      })
      .join("");
  }

  if (!result.leftovers.length) {
    renderEmpty(leftoverResults, "没有剩余订单，已经全部成功分组。");
  } else {
    leftoverResults.className = "result-list";
    const tags = result.leftovers
      .map(
        (item) =>
          `<span class="item-tag"><span>${item.id}</span><strong>${formatAmount(item.amount)}</strong></span>`
      )
      .join("");

    leftoverResults.innerHTML = `
      <article class="leftover-card">
        <div class="leftover-head">
          <div class="leftover-title">剩余订单</div>
          <span class="pill warn">总额 ${formatAmount(totalLeftoverAmount)}</span>
        </div>
        <div class="item-list">${tags}</div>
      </article>
    `;
  }
}

function buildOrderSource() {
  const manualOrders = parseManualAmounts(manualInput.value);

  if (manualOrders.length) {
    return manualOrders;
  }

  return uploadedAmounts;
}

function handleOptimize() {
  const orders = buildOrderSource();
  const targetAmount = getTargetAmount();

  if (!orders.length) {
    renderNotice(groupResults, "请先上传 Excel，或在输入框里填写订单金额。");
    renderEmpty(leftoverResults, "等待输入数据。");
    latestRun = null;
    return;
  }

  if (!(targetAmount > 0)) {
    renderNotice(groupResults, "目标金额必须大于 0。");
    renderEmpty(leftoverResults, "请先修正目标金额。");
    latestRun = null;
    return;
  }

  const result = optimizeOrders(orders, targetAmount);
  latestRun = {
    targetAmount,
    source: orders,
    result,
  };
  renderResults(result, targetAmount);
}

function handleDemoData() {
  manualInput.value = buildDemoAmounts().join(", ");
  uploadedAmounts = [];
  fileInput.value = "";
  fileStatus.textContent = "已载入演示数据，点击“开始优化”即可查看结果。";
}

function handleRandomData() {
  const generated = buildRandomAmounts();
  manualInput.value = generated.join(", ");
  uploadedAmounts = [];
  fileInput.value = "";
  fileStatus.textContent = `已随机生成 ${generated.length} 个金额，点击“开始优化”查看效果。`;
}

function readWorkbook(file) {
  if (!hasExcelEngine) {
    uploadedAmounts = [];
    fileStatus.textContent = "Excel 引擎没有成功加载，当前无法读取或导出 Excel。";
    return;
  }

  const reader = new FileReader();

  reader.onload = (loadEvent) => {
    try {
      const data = new Uint8Array(loadEvent.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const matrixRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      const objectRows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      const matrixParsed = parseExcelMatrix(matrixRows);
      const parsed = matrixParsed.length ? matrixParsed : parseExcelAmounts(objectRows);

      if (!parsed.length) {
        uploadedAmounts = [];
        fileStatus.textContent = `文件 ${file.name} 中没有识别到有效金额列。`;
        return;
      }

      uploadedAmounts = parsed;
      manualInput.value = "";
      fileInput.value = "";
      fileStatus.textContent = `已读取 ${parsed.length} 条金额数据，点击“开始优化”即可计算。`;
    } catch (error) {
      uploadedAmounts = [];
      fileStatus.textContent = `读取失败：${error.message}`;
    }
  };

  reader.onerror = () => {
    uploadedAmounts = [];
    fileStatus.textContent = "文件读取失败，请重试。";
  };

  reader.readAsArrayBuffer(file);
}

function handleFileUpload(event) {
  const [file] = event.target.files;

  if (!file) {
    uploadedAmounts = [];
    fileStatus.textContent = "还没有选择文件";
    return;
  }

  fileStatus.textContent = `正在读取：${file.name}`;
  readWorkbook(file);
}

function handleDragState(isActive) {
  uploadZone.classList.toggle("drag-active", isActive);
}

function handleDrop(event) {
  event.preventDefault();
  handleDragState(false);

  const [file] = event.dataTransfer.files;

  if (!file) {
    return;
  }

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    fileStatus.textContent = "请拖入 Excel 文件（.xlsx 或 .xls）。";
    return;
  }

  fileStatus.textContent = `正在读取：${file.name}`;
  readWorkbook(file);
}

function exportResults() {
  if (!hasExcelEngine) {
    renderNotice(groupResults, "Excel 引擎没有成功加载，当前无法导出 Excel。");
    return;
  }

  if (!latestRun) {
    renderNotice(groupResults, "请先运行一次优化，再导出结果。");
    return;
  }

  const groupRows = latestRun.result.groups.flatMap((group, index) => {
    const total = group.reduce((sum, item) => sum + item.amount, 0);
    const overflow = Math.round((total - latestRun.targetAmount) * 100) / 100;

    return group.map((item, itemIndex) => ({
      类型: "有效分组",
      分组编号: `第${index + 1}组`,
      订单ID: item.id,
      订单金额: item.amount,
      分组总额: itemIndex === 0 ? total : "",
      目标金额: itemIndex === 0 ? latestRun.targetAmount : "",
      溢出金额: itemIndex === 0 ? overflow : "",
    }));
  });

  const leftoverRows = latestRun.result.leftovers.map((item) => ({
    类型: "未分组订单",
    分组编号: "剩余",
    订单ID: item.id,
    订单金额: item.amount,
    分组总额: "",
    目标金额: latestRun.targetAmount,
    溢出金额: "",
  }));

  const summaryRows = [
    { 指标: "目标金额", 数值: latestRun.targetAmount },
    { 指标: "有效分组数", 数值: latestRun.result.groups.length },
    {
      指标: "已分组总金额",
      数值: latestRun.result.groups.reduce(
        (sum, group) => sum + group.reduce((groupSum, item) => groupSum + item.amount, 0),
        0
      ),
    },
    { 指标: "剩余订单数", 数值: latestRun.result.leftovers.length },
    {
      指标: "剩余总金额",
      数值: latestRun.result.leftovers.reduce((sum, item) => sum + item.amount, 0),
    },
  ];

  const workbook = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet([...groupRows, ...leftoverRows]);
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "汇总");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "分组明细");

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(workbook, `order-grouping-result-${timestamp}.xlsx`);
}

fileInput.addEventListener("change", handleFileUpload);
optimizeButton.addEventListener("click", handleOptimize);
useDemoButton.addEventListener("click", handleDemoData);
exportButton.addEventListener("click", exportResults);
randomButton.addEventListener("click", handleRandomData);

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    handleDragState(true);
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, () => {
    handleDragState(false);
  });
});

uploadZone.addEventListener("drop", handleDrop);

targetAmountInput.addEventListener("change", () => {
  if (Number(targetAmountInput.value) <= 0) {
    targetAmountInput.value = TARGET_AMOUNT;
  }
});

if (!hasExcelEngine) {
  fileStatus.textContent = "本地 Excel 组件未加载，上传和导出功能暂时不可用。";
}

renderEmpty(groupResults, "运行后会在这里显示分组详情。");
renderEmpty(leftoverResults, "运行后会在这里显示剩余订单。");
