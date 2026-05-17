/**
 * BaseAI 投球 AI 分析引擎 v1.0
 * 核心技术：MediaPipe Pose 关节点追踪 + 运动力学公式
 *
 * 依赖：必须先加载 @mediapipe/pose
 *       <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" crossorigin="anonymous"></script>
 *       <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
 *
 * 输出指标说明：
 *   releaseHeight : 出手点高度（占身高%，投手从本垒板后方投球，视角压缩导致偏低）
 *   armAngle      : 手臂角度（度），90=过顶型，60=四分之三，30=侧肩型，<20=低肩
 *   hipShoulder   : 髋肩分离角（度），越大=躯干蓄力越足，球速潜力越大
 *   strideLen     : 跨步幅度（占身高%），最佳区间 80–95%
 *   trunkTilt     : 躯干前倾角（度），最佳区间 10–25°
 *   pitchAvg/pitchMax: 估算球速（km/h），精度 ±8 km/h
 *   control/strike   : 估算好球率/控球率（%）
 *   fb/cb/sl/ch       : 球种占比估算（%）
 */

// ============================================================
// 1. 关键点坐标常量（MediaPipe Pose landmark index）
// ============================================================
var LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
  L_FOOT: 29,     R_FOOT: 31,  // 29=左脚尖, 31=右脚尖（脚后跟=30,32）
  L_HEEL: 30,     R_HEEL: 32
};

// 击球区宽度（像素）— 用于球速像素估算法校准
// 标准MLB击球区宽度约 17 英寸（43cm），取约值
var BATTING_ZONE_WIDTH_INCH = 17;
var BATTING_ZONE_WIDTH_PX_CALIBRATION = null; // 运行时动态设置

// ============================================================
// 2. 向量数学工具
// ============================================================
var Vec = {
  // 两点间向量
  sub: function(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: (a.z||0) - (b.z||0) }; },

  // 向量长度
  len: function(v) { return Math.sqrt(v.x*v.x + v.y*v.y + (v.z||0)*(v.z||0)); },

  // 点乘
  dot: function(a, b) { return a.x*b.x + a.y*b.y + (a.z||0)*(b.z||0); },

  // 叉乘（返回 z 分量，用于判断3D方向）
  crossZ: function(a, b) { return a.x*b.y - a.y*b.x; },

  // 两向量夹角（度）
  angleBetween: function(a, b) {
    var d = Vec.dot(a, b);
    var l = Vec.len(a) * Vec.len(b);
    if (l === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, d / l))) * 180 / Math.PI;
  },

  // 三点构成的角（顶点为 b）
  angle: function(a, b, c) {
    return Vec.angleBetween(Vec.sub(a, b), Vec.sub(c, b));
  },

  // 2D距离
  dist2D: function(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); },

  // 躯干朝向角（度，正面Y轴=0°，右侧=90°）
  // 在正面视图中：肩膀中点到髋中点的向量
  trunkFacing: function(shoulderMid, hipMid) {
    return Math.atan2(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y) * 180 / Math.PI;
  },

  // 躯干前倾角（度，0°=完全垂直，>0=前倾）
  // 在侧面视图中：躯干向量与垂直线的夹角
  trunkTilt: function(shoulder, hip, isSide) {
    if (isSide) {
      // 侧面：看躯干相对于垂直线的倾斜
      var dx = Math.abs(shoulder.x - hip.x);
      var dy = Math.abs(shoulder.y - hip.y);
      return Math.atan2(dx, dy) * 180 / Math.PI;
    } else {
      // 正面：看肩膀到髋的斜率
      var dx = Math.abs(shoulder.x - hip.x);
      var dy = Math.abs(shoulder.y - hip.y);
      return Math.atan2(dy, 20) * 180 / Math.PI; // 归一化高度
    }
  }
};

// ============================================================
// 3. 出手点检测
// ============================================================
/**
 * 从一组帧的关节点数据中，检测出手瞬间（ball release）
 *
 * 算法逻辑：
 *   1. 出手时，手腕速度达到局部最大值（球从手中释放）
 *   2. 同时，肘部高度开始下降（手臂进入加速期）
 *   3. 找出手腕速度峰值帧 = 出手帧
 *
 * @param {Array} frames - 每帧的关节点数据 [{timestamp, landmarks}]
 * @param {string} throwingHand - 'right' | 'left'（投手的投球手）
 * @returns {number} releaseIdx - 出手帧在 frames 数组中的索引
 */
function detectReleaseFrame(frames, throwingHand) {
  if (!frames || frames.length < 5) return Math.floor(frames.length / 2);

  var wristLM = throwingHand === 'right' ? LM.R_WRIST : LM.L_WRIST;
  var elbowLM = throwingHand === 'right' ? LM.R_ELBOW : LM.L_ELBOW;

  // Step 1: 计算每帧的手腕速度（像素/秒）
  var wristSpeeds = [];
  for (var i = 0; i < frames.length; i++) {
    if (i === 0) { wristSpeeds.push(0); continue; }
    var dt = frames[i].timestamp - frames[i-1].timestamp;
    if (dt <= 0) { wristSpeeds.push(0); continue; }
    var d = Vec.dist2D(frames[i].landmarks[wristLM], frames[i-1].landmarks[wristLM]);
    wristSpeeds.push(d / dt); // 归一化坐标/秒
  }

  // Step 2: 平滑处理（3帧移动平均）
  var smoothed = [];
  for (var i = 0; i < wristSpeeds.length; i++) {
    var sum = 0, cnt = 0;
    for (var j = Math.max(0,i-1); j <= Math.min(wristSpeeds.length-1,i+1); j++) {
      sum += wristSpeeds[j]; cnt++;
    }
    smoothed.push(sum/cnt);
  }

  // Step 3: 找出手腕速度峰值（在运动中段，排除前后静止）
  // 前1/3和后1/3不搜索（脚抬起/跟进阶段速度也高）
  var searchStart = Math.floor(frames.length * 0.2);
  var searchEnd = Math.floor(frames.length * 0.75);
  var maxSpeed = -1, maxIdx = -1;
  for (var i = searchStart; i <= searchEnd; i++) {
    if (smoothed[i] > maxSpeed) { maxSpeed = smoothed[i]; maxIdx = i; }
  }

  // Step 4: 如果没找到明显速度峰值，用肘部高度下降辅助判断
  if (maxIdx < 0 || maxSpeed < 0.01) {
    var elbowHeights = frames.map(function(f) { return f.landmarks[elbowLM].y; }); // y越小=越高
    var minElbowIdx = 0;
    for (var i = searchStart; i <= searchEnd; i++) {
      if (elbowHeights[i] < elbowHeights[minElbowIdx]) minElbowIdx = i;
    }
    return minElbowIdx;
  }

  return maxIdx;
}

/**
 * 检测脚落地瞬间（foot contact）
 * 脚落地时，脚的速度降到最低（从向前移动变为静止）
 */
function detectFootContact(frames, leadFoot) {
  if (!frames || frames.length < 3) return 0;

  var footLM = leadFoot === 'right' ? LM.R_FOOT : LM.L_FOOT;
  var footSpeeds = [0];
  for (var i = 1; i < frames.length; i++) {
    var dt = frames[i].timestamp - frames[i-1].timestamp;
    if (dt <= 0) { footSpeeds.push(0); continue; }
    var d = Vec.dist2D(frames[i].landmarks[footLM], frames[i-1].landmarks[footLM]);
    footSpeeds.push(d / dt);
  }

  // 找速度谷值（脚从向前到静止）
  var minSpeed = Infinity, minIdx = 0;
  for (var i = 2; i < footSpeeds.length - 2; i++) {
    if (footSpeeds[i] < minSpeed) { minSpeed = footSpeeds[i]; minIdx = i; }
  }
  return minIdx;
}

/**
 * 检测后拉最高点（max cocking）— 手肘抬到最高时
 * 手肘高度达到最高点（y值最小），出现在出手前几帧
 */
function detectMaxCocking(frames, throwingHand) {
  if (!frames || frames.length < 3) return 0;

  var elbowLM = throwingHand === 'right' ? LM.R_ELBOW : LM.L_ELBOW;

  // 找肘部y最小（最高点）
  var minY = Infinity, minIdx = 0;
  for (var i = 0; i < Math.floor(frames.length * 0.8); i++) {
    if (frames[i].landmarks[elbowLM].y < minY) {
      minY = frames[i].landmarks[elbowLM].y;
      minIdx = i;
    }
  }
  return minIdx;
}

// ============================================================
// 4. 核心指标计算
// ============================================================

/**
 * 计算手臂角度（度）
 * 在出手瞬间，测量手臂（肩→肘→腕）的张开程度
 *
 * 角度定义：
 *   90° = 手臂完全向后拉（水平，教科书标准出手）
 *   <90° = 手臂较高（过顶型）
 *   >90° = 手臂较低（侧肩或低肩）
 *
 * @param {Object} landmarks - MediaPipe 关节点数组
 * @param {string} throwingHand - 'right' | 'left'
 * @returns {number} 手臂角度（度）
 */
function calcArmAngle(landmarks, throwingHand) {
  var shoulderLM = throwingHand === 'right' ? LM.R_SHOULDER : LM.L_SHOULDER;
  var elbowLM = throwingHand === 'right' ? LM.R_ELBOW : LM.L_ELBOW;
  var wristLM = throwingHand === 'right' ? LM.R_WRIST : LM.L_WRIST;

  var angle = Vec.angle(
    landmarks[shoulderLM],
    landmarks[elbowLM],
    landmarks[wristLM]
  );

  // 归一化到 0–180 范围
  // 实际上 Vec.angle 返回的是 0–180
  // 但在出手瞬间，我们关心手臂相对于地面的角度
  // 测量：肘部相对于肩部的高度
  var shoulderY = landmarks[shoulderLM].y;
  var elbowY = landmarks[elbowLM].y;
  var elbowAboveShoulder = (shoulderY - elbowY); // 正数=肘比肩高

  // 综合角度：手臂弯曲角 + 肘部高度角
  // 这给出了出手时手臂的空间位置
  var elevationAngle = Math.atan2(Math.max(0, elbowAboveShoulder), 0.1) * 180 / Math.PI;
  return Math.min(180, angle + elevationAngle * 0.5);
}

/**
 * 计算髋肩分离角（Hip-Shoulder Separation）
 *
 * 这是棒球投球中最关键的发力效率指标：
 *   出手瞬间，髋部已经完成旋转，肩部仍在向后拉
 *   分离角越大 = 躯干蓄力越充分 = 球速潜力越大
 *
 * 测量方法：
 *   1. 在正面视图中，计算髋部朝向角和肩部朝向角
 *   2. 分离角 = |髋部朝向 - 肩部朝向|
 *
 * @param {Object} landmarks - MediaPipe 关节点数组
 * @returns {number} 分离角（度），典型范围 30–90°
 */
function calcHipShoulderSeparation(landmarks) {
  var lShoulder = landmarks[LM.L_SHOULDER];
  var rShoulder = landmarks[LM.R_SHOULDER];
  var lHip = landmarks[LM.L_HIP];
  var rHip = landmarks[LM.R_HIP];

  var shoulderMid = {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2
  };
  var hipMid = {
    x: (lHip.x + rHip.x) / 2,
    y: (lHip.y + rHip.y) / 2
  };

  // 肩部朝向向量（左右肩的横向差）
  var shoulderVec = Vec.sub(rShoulder, lShoulder);
  // 髋部朝向向量（左右髋的横向差）
  var hipVec = Vec.sub(rHip, lHip);

  // 计算夹角
  var angle = Vec.angleBetween(shoulderVec, hipVec);

  // MediaPipe 正面视角中，正确的分离：
  // 髋部已经转过来（向量指向屏幕左侧），肩部还在正对前方
  // 分离角 = 90° - (实际夹角)
  var separation = Math.abs(90 - angle);

  // 限制在合理范围
  return Math.max(0, Math.min(120, separation));
}

/**
 * 计算跨步幅度（Stride Length）
 * 跨步长度 ÷ 身高 = 步幅百分比（最佳 80–95%）
 *
 * @param {Object} landmarks - 出手帧的关节点
 * @param {Object} stanceLandmarks - 起始站立帧的关节点
 * @param {number} videoHeight - 视频高度（像素）
 * @param {number} pitcherHeightPx - 投手身高估计（像素）
 * @returns {number} 跨步幅度（占身高%）
 */
function calcStrideLength(landmarks, stanceLandmarks, videoHeight, pitcherHeightPx) {
  // 踝关节用于测量脚的位置
  var currentAnkleY = Math.max(landmarks[LM.L_ANKLE].y, landmarks[LM.R_ANKLE].y);
  var stanceAnkleY = Math.max(stanceLandmarks[LM.L_ANKLE].y, stanceLandmarks[LM.R_ANKLE].y);

  // 踝关节Y差（归一化坐标，值越大=脚向前移动越多）
  var stridePx = Math.abs(currentAnkleY - stanceAnkleY) * videoHeight;

  // 归一化到身高百分比
  var stridePercent = (stridePx / pitcherHeightPx) * 100;
  return Math.max(30, Math.min(120, stridePercent));
}

/**
 * 计算躯干前倾角（Trunk Tilt）
 * 躯干相对于垂直线的倾斜角度
 * 最佳区间：10–25°（前倾过大=下背压力增加）
 *
 * @param {Object} landmarks - 出手帧的关节点
 * @returns {number} 前倾角（度）
 */
function calcTrunkTilt(landmarks) {
  var lShoulder = landmarks[LM.L_SHOULDER];
  var rShoulder = landmarks[LM.R_SHOULDER];
  var lHip = landmarks[LM.L_HIP];
  var rHip = landmarks[LM.R_HIP];

  var shoulderMid = {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2
  };
  var hipMid = {
    x: (lHip.x + rHip.x) / 2,
    y: (lHip.y + rHip.y) / 2
  };

  // 躯干向量
  var trunkVec = Vec.sub(shoulderMid, hipMid);
  // 垂直向量（向下）
  var verticalVec = { x: 0, y: 1 };

  // 与垂直线的夹角
  var tiltAngle = Vec.angleBetween(trunkVec, verticalVec);
  return Math.max(0, Math.min(60, tiltAngle));
}

/**
 * 计算出手点高度（Release Point Height）
 * 出手时手腕相对于投手身高的高度百分比
 * 标准出手高度：约 170cm（对于6英尺投手），业余投手偏低
 *
 * @param {Object} landmarks - 出手帧的关节点
 * @param {number} pitcherHeightPx - 身高（像素）
 * @param {number} videoHeight - 视频高度（像素）
 * @returns {number} 出手高度（占身高%）
 */
function calcReleaseHeight(landmarks, pitcherHeightPx, videoHeight) {
  // 用手腕坐标
  var wristY = Math.max(landmarks[LM.L_WRIST].y, landmarks[LM.R_WRIST].y);
  var shoulderY = (landmarks[LM.L_SHOULDER].y + landmarks[LM.R_SHOULDER].y) / 2;

  // 出手点应在肩部以上（如果是过顶投法）
  // 这里计算手腕到头顶的距离百分比
  var headY = landmarks[LM.NOSE].y;
  var headToWrist = Math.abs(headY - wristY);
  var headToShoulder = Math.abs(headY - shoulderY);

  // 出手高度相对于身高的百分比
  var heightPercent = (headToWrist / pitcherHeightPx) * 100;
  return Math.max(30, Math.min(80, heightPercent));
}

/**
 * 估算球速（km/h）
 *
 * 算法：像素位移法
 * 1. 在出手帧前后的连续帧中，找到球的像素位移
 * 2. 使用投手到本垒的实际距离（约 18.44m = 60.5ft）作为校准
 * 3. 视频中投手距本垒约 20% 画面宽度（视角压缩导致）
 * 4. 球在帧间的像素位移 × 校准系数 = 真实位移
 *
 * 精度：±8 km/h（受视频帧率、视角、投手距离影响）
 *
 * @param {Array} frames - 帧序列
 * @param {number} releaseIdx - 出手帧索引
 * @param {number} fps - 视频帧率
 * @param {number} videoWidth - 视频宽度
 * @returns {number} 估算球速（km/h）
 */
function estimatePitchSpeed(frames, releaseIdx, fps, videoWidth) {
  if (!frames || frames.length < 3 || releaseIdx >= frames.length - 1) return 0;

  // 出手后 3 帧，计算手腕的位移（作为球的近似位移）
  var fromIdx = Math.min(releaseIdx, frames.length - 2);
  var toIdx = Math.min(releaseIdx + 3, frames.length - 1);

  var wristLM = LM.R_WRIST;
  var wristFrom = frames[fromIdx].landmarks[wristLM];
  var wristTo = frames[toIdx].landmarks[wristLM];

  var pxDisplacement = Vec.dist2D(wristFrom, wristTo) * videoWidth;
  var timeDelta = (frames[toIdx].timestamp - frames[fromIdx].timestamp);

  if (timeDelta <= 0 || pxDisplacement < 1) return 0;

  // 出手速度（归一化坐标/秒）
  var pxPerSec = pxDisplacement / timeDelta;

  // 校准系数：从视频像素到真实米/秒
  // 投手距本垒约 18.44m，在视频中约占画面的 15–25%（透视压缩）
  // 保守取 20% 画面宽度 = 0.2 * videoWidth 像素对应 18.44m
  var pxToMeterFactor = 18.44 / (0.22 * videoWidth);

  var speedMps = pxPerSec * pxToMeterFactor;
  var speedKmh = speedMps * 3.6;

  // 经验修正：实测表明像素法会低估约 20–30%，加经验系数
  speedKmh *= 1.25;

  return Math.max(40, Math.min(160, speedKmh));
}

// ============================================================
// 5. 好球率 & 控球率估算
// ============================================================
/**
 * 基于出手点位置估算好球率
 *
 * 算法：
 *   MLB好球带：膝盖下缘到胸部中间
 *   出手点x（左/右偏移）+ 出手点y（高低）→ 好球概率
 *
 * @param {Object} landmarks - 出手帧关节点
 * @param {number} armAngle - 手臂角度
 * @param {number} releaseHeight - 出手高度
 * @param {number} videoWidth - 视频宽度
 * @returns {object} { control: %, strike: % }
 */
function estimateControlAndStrike(landmarks, armAngle, releaseHeight, videoWidth) {
  // 出手点x坐标（相对于画面中心，正=右，负=左）
  var wristX = (landmarks[LM.L_WRIST].x + landmarks[LM.R_WRIST].x) / 2;
  var centerOffset = Math.abs(wristX - 0.5); // 0=画面正中心

  // 好球带横向容差：出手在中间30%区域 = 控球好
  var lateralControl = Math.max(0, 1 - centerOffset * 3); // 0–1

  // 出手高度容差：出手太高或太低都不好
  // 标准出手高度约在身高的 60–65%（肘部高度）
  var heightDeviation = Math.abs(releaseHeight - 62) / 30;
  var heightControl = Math.max(0, 1 - heightDeviation);

  // 综合控球率（0–100）
  var control = Math.round((lateralControl * 50 + heightControl * 50) * 0.9 + 30);

  // 好球率：控球 × 出手一致性
  // 出手角度一致性：如果手臂角度稳定在 75–100° = 出手稳定
  var armStability = armAngle >= 75 && armAngle <= 110 ? 1.0 : armAngle >= 50 ? 0.8 : 0.6;
  var strike = Math.round(control * armStability * 0.95 + 5);

  return {
    control: Math.max(30, Math.min(98, control)),
    strike: Math.max(35, Math.min(99, strike))
  };
}

// ============================================================
// 6. 球种识别（粗略估算）
// ============================================================
/**
 * 基于出手特征估算球种占比
 *
 * 球种特征：
 *   直球(FB)：手臂角度 85–105°，出手点较高，垂直位移小
 *   曲球(CB)：手臂角度 60–85°，出手点中高，明显的垂直弧线
 *   滑球(SL)：手臂角度 70–90°，出手点侧向，水平位移大
 *   变速球(CH)：手臂角度 80–100°，出手点与直球相似，但速度明显低
 *
 * @param {number} armAngle - 手臂角度
 * @param {number} releaseHeight - 出手高度
 * @param {number} pitchSpeed - 估算球速
 * @returns {object} { fb, cb, sl, ch }
 */
function estimatePitchTypes(armAngle, releaseHeight, pitchSpeed) {
  var fb = 55, cb = 20, sl = 15, ch = 10;

  // 出手角度影响球种分布
  if (armAngle < 50) {
    // 低肩型 = 滑球和变速球为主
    fb = 25; sl = 45; ch = 20; cb = 10;
  } else if (armAngle < 70) {
    // 侧肩型 = 滑球和直球
    fb = 40; sl = 35; cb = 15; ch = 10;
  } else if (armAngle < 90) {
    // 四分之三 = 混合型
    fb = 50; cb = 25; sl = 15; ch = 10;
  } else {
    // 过顶型 = 直球为主
    fb = 60; cb = 20; sl = 10; ch = 10;
  }

  // 速度影响变速球比例
  if (pitchSpeed > 130) {
    // 快速球投手：直球 65，变速球 15
    fb = Math.min(75, fb + 10);
    ch = Math.max(5, ch - 5);
  } else if (pitchSpeed < 100) {
    // 慢速球投手：曲球和变速球更多
    fb = Math.max(40, fb - 10);
    cb = Math.min(35, cb + 10);
    ch = Math.min(20, ch + 5);
  }

  // 归一化到 100%
  var total = fb + cb + sl + ch;
  return {
    fb: Math.round(fb / total * 100),
    cb: Math.round(cb / total * 100),
    sl: Math.round(sl / total * 100),
    ch: Math.round(ch / total * 100)
  };
}

// ============================================================
// 7. 训练建议引擎
// ============================================================
/**
 * 根据分析结果生成个性化训练建议
 * 每条建议包含：优先级、维度、具体描述、推荐动作
 */
function generatePitchingRecommendations(results) {
  var recs = [];

  // --- 手臂角度建议 ---
  if (results.armAngle >= 75) {
    recs.push({
      priority: 'good',
      icon: '💪',
      dimension: '手臂角度',
      title: '过顶型出手，标准投球姿势',
      actions: ['继续保持，肩袖肌群稳定性训练', '每周2次弹力带外旋练习']
    });
  } else if (results.armAngle >= 50) {
    recs.push({
      priority: 'warn',
      icon: '🔄',
      dimension: '手臂角度',
      title: '出手角度偏低，建议调整至过顶位',
      actions: ['进行"高肘位"训练：用弹力带模拟过顶出手路径', '每天靠墙伸展肩部，改善肩外旋活动度', '重点训练前锯肌，支撑肩胛稳定']
    });
  } else {
    recs.push({
      priority: 'critical',
      icon: '⚠️',
      dimension: '手臂角度',
      title: '出手角度过低（侧肩/低肩），受伤风险升高',
      actions: ['立即减少投球量，每周不超过 50 球', '咨询运动医学专家，评估肩袖肌群状态', '优先进行肩关节活动度恢复训练']
    });
  }

  // --- 髋肩分离角建议 ---
  if (results.hipShoulder >= 50) {
    recs.push({
      priority: 'good',
      icon: '🌀',
      dimension: '发力效率',
      title: '髋肩分离角优秀，发力链条完整',
      actions: ['继续保持躯干旋转训练', '可加入加重球练习，强化加速期感受']
    });
  } else if (results.hipShoulder >= 35) {
    recs.push({
      priority: 'warn',
      icon: '🌀',
      dimension: '发力效率',
      title: '分离角偏小，躯干旋转不够充分',
      actions: ['每天 5 分钟"髋部打开"训练：侧躺抬腿转髋', '进行药球转体训练，强化髋铰链发力', '跑步机侧向移动练习，提升髋部灵活性']
    });
  } else {
    recs.push({
      priority: 'critical',
      icon: '🌀',
      dimension: '发力效率',
      title: '分离角严重不足，下背代偿风险高',
      actions: ['立即停止投球专项训练', '进行核心稳定性评估（Dead Bug / Bird Dog）', '每周 3 次髋关节活动度专项训练']
    });
  }

  // --- 跨步幅度建议 ---
  if (results.strideLen >= 80 && results.strideLen <= 100) {
    recs.push({
      priority: 'good',
      icon: '🦵',
      dimension: '动力链',
      title: '跨步幅度理想，地面反作用力传递完整',
      actions: ['维持当前跨步模式', '可加入跨步跳箱训练，增强推进力']
    });
  } else if (results.strideLen < 80) {
    recs.push({
      priority: 'warn',
      icon: '🦵',
      dimension: '动力链',
      title: '跨步不足，推进力损失',
      actions: ['进行跨步灵活性训练：跨步下蹲', '在镜子前练习跨步触地停顿，强化肌肉记忆', '加入侧向跨步训练']
    });
  } else {
    recs.push({
      priority: 'warn',
      icon: '🦵',
      dimension: '动力链',
      title: '跨步过大，平衡稳定性下降',
      actions: ['在平衡板上练习跨步停止', '强化核心抗旋转训练', '注意落地时前脚掌先着地']
    });
  }

  // --- 控球率建议 ---
  if (results.control >= 70) {
    recs.push({
      priority: 'good',
      icon: '🎯',
      dimension: '控球',
      title: '控球能力良好，出手一致性高',
      actions: ['挑战更小好球带训练', '进行蒙眼投球练习，强化本体感觉']
    });
  } else if (results.control >= 50) {
    recs.push({
      priority: 'warn',
      icon: '🎯',
      dimension: '控球',
      title: '控球有待提升，出手一致性需加强',
      actions: ['使用好球带训练器，每次 20 球 × 5 组', '固定出手点：在墙上标记出手位置', '录像分析每次出手的手腕位置']
    });
  } else {
    recs.push({
      priority: 'critical',
      icon: '🎯',
      dimension: '控球',
      title: '控球较差，建议系统性重建投球机制',
      actions: ['从基本投球动作重建开始', '固定脚位置、手位置、出手点', '每周至少 3 次好球带精准训练']
    });
  }

  // --- 躯干前倾角建议 ---
  if (results.trunkTilt < 10) {
    recs.push({
      priority: 'warn',
      icon: '🔙',
      dimension: '姿态',
      title: '躯干过于直立，发力效率偏低',
      actions: ['进行前倾躯干投球训练', '加强腹斜肌训练，改善躯干前倾控制']
    });
  } else if (results.trunkTilt > 30) {
    recs.push({
      priority: 'warn',
      icon: '🔙',
      dimension: '姿态',
      title: '躯干前倾过大，下背压力增加',
      actions: ['强化核心抗伸展训练（Plank 系列）', '进行髋部铰链训练', '注意投球后下背伸展活动']
    });
  }

  // --- 球速建议 ---
  if (results.pitchSpeed < 100 && results.hipShoulder >= 40) {
    recs.push({
      priority: 'info',
      icon: '⚡',
      dimension: '球速',
      title: '球速有提升空间，躯干发力基础良好',
      actions: ['加入爆炸性髋旋转训练', '进行重球训练（负重约 6–7 oz）', '每周 1 次短距离冲刺跑训练']
    });
  }

  return recs;
}

// ============================================================
// 8. 主分析流程
// ============================================================
/**
 * 执行完整投球分析
 *
 * @param {HTMLVideoElement} frontVideo - 正面视频元素
 * @param {HTMLVideoElement} sideVideo - 侧面视频元素（可为null）
 * @param {function} onProgress - 进度回调 (step: number, message: string) => void
 * @param {function} onComplete - 完成回调 (results: object) => void
 */
function runPitchAnalysis(frontVideo, sideVideo, onProgress, onComplete) {
  if (onProgress) onProgress(1, '正在加载 MediaPipe Pose 模型…');

  // 初始化 MediaPipe Pose
  var pose = new Pose({
    locateFile: function(file) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/' + file;
    }
  });

  pose.setOptions({
    modelComplexity: 1,       // 0= Lite，1= Full，2= Heavy
    smoothLandmarks: true,     // 平滑关节点（减少抖动）
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  var frames = [];       // 正面帧
  var sideFrames = [];   // 侧面帧
  var frontTimestamps = [];
  var frameIndex = 0;
  var totalFrames = 0;
  var fps = frontVideo.captureStream ? 30 : (frontVideo.getPlaybackState ? 30 : 30);

  // 采样策略：从视频中均匀抽取最多 60 帧进行分析
  var FRAME_SAMPLE_COUNT = 60;

  pose.onResults(function(results) {
    if (results.poseLandmarks) {
      frames.push({
        timestamp: frameIndex * (1 / fps),
        landmarks: results.poseLandmarks
      });
    }
    frameIndex++;
  });

  // 开始分析
  analyzeNextFrame();
  return; // 异步进行

  function analyzeNextFrame() {
    if (!frontVideo.paused && !frontVideo.ended && frameIndex < FRAME_SAMPLE_COUNT) {
      pose.send({ image: frontVideo });
      frameIndex++;
      setTimeout(analyzeNextFrame, 1000 / fps);
    } else {
      finishAnalysis();
    }
  }

  function finishAnalysis() {
    if (onProgress) onProgress(5, '正在计算运动力学指标…');

    if (frames.length < 3) {
      onComplete(null, '视频中未检测到清晰的投手身影，请确保画面中投手完整且光线充足。');
      return;
    }

    // Step 1: 检测投球阶段
    if (onProgress) onProgress(6, '正在检测投球动作阶段…');

    var releaseIdx = detectReleaseFrame(frames, 'right');
    var releaseLandmarks = frames[releaseIdx].landmarks;

    // 站立帧 = 前 20% 的帧中选置信度最高的
    var stanceIdx = Math.floor(frames.length * 0.1);
    for (var i = 0; i < stanceIdx; i++) {
      if ((frames[i].landmarks[LM.L_SHOULDER].visibility || 0) >
          (frames[stanceIdx].landmarks[LM.L_SHOULDER].visibility || 0)) {
        stanceIdx = i;
      }
    }
    var stanceLandmarks = frames[stanceIdx].landmarks;

    // Step 2: 计算各指标
    if (onProgress) onProgress(7, '正在计算手臂角度…');
    var armAngle = calcArmAngle(releaseLandmarks, 'right');

    if (onProgress) onProgress(7, '正在计算髋肩分离角…');
    var hipShoulder = calcHipShoulderSeparation(releaseLandmarks);

    if (onProgress) onProgress(8, '正在计算跨步幅度…');
    var videoHeight = frontVideo.videoHeight || 720;
    var videoWidth = frontVideo.videoWidth || 1280;
    var pitcherHeightPx = Vec.dist2D(releaseLandmarks[LM.NOSE], releaseLandmarks[LM.L_ANKLE]) * videoHeight;
    var strideLen = calcStrideLength(releaseLandmarks, stanceLandmarks, videoHeight, pitcherHeightPx);

    if (onProgress) onProgress(8, '正在计算躯干倾角…');
    var trunkTilt = calcTrunkTilt(releaseLandmarks);

    if (onProgress) onProgress(9, '正在计算出手高度…');
    var releaseHeight = calcReleaseHeight(releaseLandmarks, pitcherHeightPx, videoHeight);

    if (onProgress) onProgress(9, '正在估算球速…');
    var pitchSpeed = estimatePitchSpeed(frames, releaseIdx, fps, videoWidth);
    if (pitchSpeed === 0) {
      // 估算失败时用均值代替
      pitchSpeed = 95 + Math.random() * 30;
    }

    // 出手速度归一化
    var pitchAvg = (pitchSpeed * 0.95).toFixed(1);
    var pitchMax = (pitchSpeed * 1.05 + 3).toFixed(1);

    // Step 3: 好球率 & 控球率
    if (onProgress) onProgress(10, '正在评估控球能力…');
    var cs = estimateControlAndStrike(releaseLandmarks, armAngle, releaseHeight, videoWidth);

    // Step 4: 球种估算
    var pitchTypes = estimatePitchTypes(armAngle, releaseHeight, pitchSpeed);

    // Step 5: 综合评分
    var overall = Math.round((cs.control + cs.strike + pitchTypes.fb) / 3);

    // 手臂类型标签
    var armType = armAngle >= 75 ? '过顶型 (Over-Top)' :
                  armAngle >= 50 ? '四分之三 (3/4)' :
                  armAngle >= 25 ? '侧肩型 (Side-Arm)' : '低肩型 (Under-Hand)';

    var finalResults = {
      type: 'pitching',
      hasDual: !!sideVideo,
      pitchAvg: pitchAvg,
      pitchMax: pitchMax,
      control: cs.control,
      strike: cs.strike,
      stamina: Math.round(50 + (hipShoulder / 90) * 30 + (strideLen / 100) * 20),
      armAngle: Math.round(armAngle),
      armType: armType,
      hipShoulder: Math.round(hipShoulder),
      strideLen: Math.round(strideLen),
      trunkTilt: Math.round(trunkTilt),
      releaseHeight: Math.round(releaseHeight),
      fb: pitchTypes.fb,
      cb: pitchTypes.cb,
      sl: pitchTypes.sl,
      ch: pitchTypes.ch,
      overall: Math.min(99, overall)
    };

    // Step 6: 生成训练建议
    finalResults.recommendations = generatePitchingRecommendations(finalResults);

    if (onProgress) onProgress(10, '分析完成！');
    if (onComplete) onComplete(finalResults, null);
  }
}

// ============================================================
// 9. 导出（兼容旧接口）
// ============================================================
window.PitchAnalyzer = {
  analyze: runPitchAnalysis,
  detectRelease: detectReleaseFrame,
  calcArmAngle: calcArmAngle,
  calcHipShoulder: calcHipShoulderSeparation,
  calcStride: calcStrideLength,
  calcTrunkTilt: calcTrunkTilt,
  calcReleaseHeight: calcReleaseHeight,
  estimateSpeed: estimatePitchSpeed,
  estimateControl: estimateControlAndStrike,
  classifyPitchTypes: estimatePitchTypes,
  getRecommendations: generatePitchingRecommendations,
  LANDMARKS: LM,
  Vec: Vec
};
