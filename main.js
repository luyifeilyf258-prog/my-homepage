const toast = document.getElementById("toast");
const year = document.getElementById("year");
year.textContent = new Date().getFullYear();

function showToast(text){
  toast.textContent = text;
  toast.animate(
    [{ transform: "translateY(4px)", opacity: 0.2 }, { transform: "translateY(0)", opacity: 1 }],
    { duration: 180, easing: "ease-out" }
  );
}

document.querySelectorAll(".chip[data-msg]").forEach(btn => {
  btn.addEventListener("click", () => showToast(btn.dataset.msg));
});

document.getElementById("confettiBtn").addEventListener("click", () => {
  showToast("🎊 恭喜！你刚刚触发了‘小白也能做网站’成就！");
  // 简易“彩纸”：在页面上随机飘几个emoji
  for(let i=0;i<16;i++){
    const s = document.createElement("div");
    s.textContent = ["✨","🎉","🎈","⭐","🍬"][Math.floor(Math.random()*5)];
    s.style.position = "fixed";
    s.style.left = Math.random()*100 + "vw";
    s.style.top = "-20px";
    s.style.fontSize = (16 + Math.random()*18) + "px";
    s.style.transition = "transform 1.2s linear, opacity 1.2s linear";
    s.style.zIndex = 9999;
    document.body.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = `translateY(${110 + Math.random()*40}vh) rotate(${Math.random()*360}deg)`;
      s.style.opacity = "0";
    });
    setTimeout(()=>s.remove(), 1300);
  }
});
// ===== 体重追踪：Excel -> 折线图 + 卡尔曼滤波 =====

let weightChartInstance = null;

function formatKg(x){
  if (x == null || Number.isNaN(x)) return "—";
  return `${x.toFixed(1)} kg`;
}

// 一维卡尔曼滤波（随机游走模型）
// x_k = x_{k-1} + w,  z_k = x_k + v
// Q: 过程噪声（体重真实变化速度）
// R: 观测噪声（测量波动：水分/衣物/时间等）
function kalman1D(zs, { Q = 0.02, R = 0.25, x0 = null, P0 = 1 } = {}){
  const n = zs.length;
  if (n === 0) return [];

  let x = (x0 != null) ? x0 : zs[0];  // 初值默认取第一条测量
  let P = P0;

  const xs = [];
  for (let k = 0; k < n; k++){
    const z = zs[k];

    // predict
    P = P + Q;

    // update
    const K = P / (P + R);   // Kalman gain
    x = x + K * (z - x);
    P = (1 - K) * P;

    xs.push(x);
  }
  return xs;
}

function renderWeightChart(labels, raw, kf){
  const ctx = document.getElementById("weightChart");
  if (!ctx) return;

  if (weightChartInstance){
    weightChartInstance.destroy();
    weightChartInstance = null;
  }

  weightChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "测量体重", data: raw, tension: 0.25 },
        { label: "卡尔曼真实体重", data: kf, tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: { title: { display: true, text: "kg" } }
      }
    }
  });
}

async function parseExcelFile(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // 兼容几种常见列名：Date/日期、Weight/体重
  const dates = [];
  const weights = [];

  for (const r of rows){
    const d = r.Date ?? r.date ?? r.日期 ?? r["日期"] ?? r["Date"];
    const w = r.Weight ?? r.weight ?? r.体重 ?? r["体重"] ?? r["Weight"];

    const wNum = Number(w);
    if (!Number.isFinite(wNum)) continue;

    // label 直接用原值（Date 可能是字符串/Excel日期序号）
    // 若是 Excel 日期序号，SheetJS 可能解析成数字；这里简单转字符串
    dates.push(String(d ?? ""));
    weights.push(wNum);
  }

  return { dates, weights };
}

function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

const weightFileInput = document.getElementById("weightFile");
if (weightFileInput){
  weightFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try{
      setText("weightNote", `正在读取：${file.name} ...`);

      const { dates, weights } = await parseExcelFile(file);

      if (weights.length < 2){
        setText("weightNote", "数据太少：至少需要 2 条体重记录。请检查列名 Date/Weight 或 日期/体重。");
        return;
      }

      // 这里的 Q/R 你之后可以调参（我先给你一个比较“像真实体重”的默认值）
      const kf = kalman1D(weights, { Q: 0.02, R: 0.25 });

      setText("rawLatest", formatKg(weights[weights.length - 1]));
      setText("kfLatest", formatKg(kf[kf.length - 1]));
      setText("nPoints", String(weights.length));

      // labels 若为空就用序号兜底
      const labels = dates.every(x => x && x !== "undefined") ? dates : weights.map((_, i) => String(i + 1));

      renderWeightChart(labels, weights, kf);

      setText("weightNote", "✅ 已更新图表与卡尔曼估计。你也可以通过调 Q/R 让曲线更“平滑/灵敏”。");
    }catch(err){
      console.error(err);
      setText("weightNote", "读取失败：请确认是 .xlsx/.xls/.csv，并且包含 Date/Weight（或 日期/体重）两列。");
    }finally{
      // 允许再次选同一个文件也触发 change
      e.target.value = "";
    }
  });
}

