// functions/generate-video-batch.js
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// import templates & formats
const { templates, formats } = require("./video-config");

// sauvegarde état job
async function saveJob(jobId, data) {
  const file = path.join("/tmp", jobId + ".json");
  fs.writeFileSync(file, JSON.stringify(data));
}

// 🧩 Helpers FFmpeg
function buildTextFilter({ title, price, template }) {
  return `
drawtext=fontfile=/fonts/${template.font}:
text='${title}':
x=(w-text_w)/2:
y=h*0.68:
fontsize=64:
fontcolor=${template.titleColor}:
shadowcolor=black:
shadowx=3:
shadowy=3,

drawtext=fontfile=/fonts/${template.font}:
text='${price}':
x=(w-text_w)/2:
y=h*0.77:
fontsize=82:
fontcolor=${template.priceColor}:
shadowcolor=black:
shadowx=3:
shadowy=3
`;
}

function buildCTA(template) {
  return `
drawbox=x=0:y=h*0.84:w=w:h=150:color=${template.ctaBg}:t=fill,
drawtext=fontfile=/fonts/${template.font}:
text='${template.ctaText}':
x=(w-text_w)/2:
y=h*0.88:
fontsize=54:
fontcolor=white:
enable='gte(t,1.5)'
`;
}

function buildZoom(template) {
  return `zoompan=z='min(zoom+${template.zoom},1.1)':d=60`;
}

// 🏁 Génération batch
async function generateVideoBatch(jobId, inputVideo, productData) {
  for (const templateName in templates) {
    const template = templates[templateName];

    const vf = `
${buildZoom(template)},
${buildTextFilter({
  title: productData.title,
  price: productData.price,
  template
})},
${buildCTA(template)}
`;

    for (const formatName in formats) {
      const format = formats[formatName];
      const resize = format.scale ? `scale=${format.scale}` : "";

      const output = `/tmp/${productData.id}_${templateName}_${formatName}.mp4`;

      const cmd = `
ffmpeg -i ${inputVideo} \
-vf "${vf},${resize}" \
-c:a copy \
${output}
`;

      exec(cmd, (err) => {
        if (err) console.error("FFmpeg error:", err);
        else console.log(`✅ Génération: ${templateName} / ${formatName}`);
      });
    }
  }
}

// 🔹 Netlify handler
export const handler = async (event) => {
  const { inputVideoUrl, product } = JSON.parse(event.body);
  const jobId = Date.now().toString();

  await saveJob(jobId, { status: "processing", createdAt: Date.now() });

  // NE PAS await → async batch
  generateVideoBatch(jobId, inputVideoUrl, product);

  return {
    statusCode: 202,
    body: JSON.stringify({ status: "processing", jobId }),
  };
};