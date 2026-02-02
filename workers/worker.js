// worker.js
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import axios from "axios";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "child_process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ffmpegPath = ffmpegInstaller.path;

async function processJob(job) {
  const tmpDir = "/tmp";
  const videoPath = path.join(tmpDir, `${job.id}_full.mp4`);
  const finalVideoPath = path.join(tmpDir, `${job.id}_15s.mp4`);
  const thumbnailPath = path.join(tmpDir, `${job.id}_thumb.jpg`);

  const { images, music_url: musicUrl, title, price } = job;

  // 1️⃣ Télécharger images
  const imageFiles = [];
  for (let i = 0; i < images.length; i++) {
    const imgPath = path.join(tmpDir, `img_${job.id}_${i}.jpg`);
    const resp = await axios.get(images[i], { responseType: "arraybuffer" });
    fs.writeFileSync(imgPath, resp.data);
    imageFiles.push(imgPath);
  }

  // 2️⃣ Télécharger musique si présente
  let musicPath = null;
  if (musicUrl) {
    const resp = await axios.get(musicUrl, { responseType: "arraybuffer" });
    musicPath = path.join(tmpDir, `music_${job.id}.mp3`);
    fs.writeFileSync(musicPath, resp.data);
  }

  // 3️⃣ Concat images + audio
  const txtFile = path.join(tmpDir, `${job.id}_file_list.txt`);
  let txtContent = "";
  imageFiles.forEach((f, i) => {
    txtContent += `file '${f}'\nduration 3\n`;
    if (i === imageFiles.length - 1) txtContent += `file '${f}'\n`;
  });
  fs.writeFileSync(txtFile, txtContent);

  const ffmpegArgs = ["-f", "concat", "-safe", "0", "-i", txtFile];
  if (musicPath) ffmpegArgs.push("-i", musicPath);
  ffmpegArgs.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", videoPath);

  await new Promise((res, rej) => execFile(ffmpegPath, ffmpegArgs, err => err ? rej(err) : res()));

  // 4️⃣ Découper à 15 secondes
  await new Promise((res, rej) =>
    execFile(ffmpegPath, ["-i", videoPath, "-ss", "0", "-t", "15",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", finalVideoPath], err => err ? rej(err) : res())
  );

  // 5️⃣ Créer miniature
  await new Promise((res, rej) =>
    execFile(ffmpegPath, ["-i", finalVideoPath, "-ss", "00:00:01.000", "-vframes", "1", thumbnailPath],
      err => err ? rej(err) : res())
  );

  // 6️⃣ Upload sur Supabase Storage
  const videoData = fs.readFileSync(finalVideoPath);
  const videoFileName = `products/${Date.now()}_${job.id}.mp4`;
  await supabase.storage.from("videos").upload(videoFileName, videoData, { contentType: "video/mp4" });

  const thumbData = fs.readFileSync(thumbnailPath);
  const thumbFileName = `products/thumb_${Date.now()}_${job.id}.jpg`;
  await supabase.storage.from("videos").upload(thumbFileName, thumbData, { contentType: "image/jpeg" });

  const { data: { publicUrl: videoUrl } } = supabase.storage.from("videos").getPublicUrl(videoFileName);
  const { data: { publicUrl: thumbUrl } } = supabase.storage.from("videos").getPublicUrl(thumbFileName);

  // 7️⃣ Mettre à jour le job en base
  await supabase.from("video_jobs").update({
    status: "completed",
    video_url: videoUrl,
    thumbnail_url: thumbUrl
  }).eq("id", job.id);
}

// Fonction pour récupérer les jobs en queue et les traiter
export async function workerLoop() {
  const { data: jobs } = await supabase.from("video_jobs").select("*").eq("status", "queued");

  for (const job of jobs) {
    try {
      await supabase.from("video_jobs").update({ status: "processing" }).eq("id", job.id);
      await processJob(job);
    } catch (err) {
      console.error("Erreur job", job.id, err);
      await supabase.from("video_jobs").update({ status: "failed" }).eq("id", job.id);
    }
  }

  // Relancer toutes les X secondes
  setTimeout(workerLoop, 5000);
}

// Démarrer le worker
workerLoop();