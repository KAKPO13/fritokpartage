import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

// ⚡ Variables d'environnement Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ⚡ Chemin vers FFmpeg fourni par @ffmpeg-installer/ffmpeg
const ffmpegPath = ffmpegInstaller.path;

// ⚡ Chemin vers la police incluse dans ton projet
const fontPath = path.join(process.cwd(), "netlify/functions/fonts/DejaVuSans-Bold.ttf");

export async function handler(event) {
  try {
    const { images, title, price, musicUrl } = JSON.parse(event.body);

    if (!images || images.length === 0) {
      return { statusCode: 400, body: "Aucune image fournie" };
    }

    const tmpDir = "/tmp";
    const videoPath = path.join(tmpDir, "output_full.mp4");
    const finalVideoPath = path.join(tmpDir, "output_15s.mp4");
    const thumbnailPath = path.join(tmpDir, "thumb.jpg");

    // 1️⃣ Télécharger toutes les images
    const imageFiles = [];
    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      const imgPath = path.join(tmpDir, `img${i}.jpg`);
      const response = await axios.get(imgUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(imgPath, response.data);
      imageFiles.push(imgPath);
    }

    // 2️⃣ Télécharger musique ou vidéo et gérer les trois cas
    let musicPath = null;
    if (musicUrl) {
      const response = await axios.get(musicUrl, { responseType: "arraybuffer" });
      const contentType = response.headers["content-type"];

      if (contentType && contentType.startsWith("audio/")) {
        // Cas 1 : fichier audio direct
        musicPath = path.join(tmpDir, "music.mp3");
        fs.writeFileSync(musicPath, response.data);
      } else if (contentType && contentType.startsWith("video/")) {
        // Cas 2 : fichier vidéo → extraire l’audio
        const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
        fs.writeFileSync(rawVideoPath, response.data);

        musicPath = path.join(tmpDir, "music.mp3");
        await new Promise((resolve, reject) => {
          execFile(ffmpegPath, [
            "-i", rawVideoPath,
            "-q:a", "0",
            "-map", "a",
            musicPath
          ], (err) => err ? reject(err) : resolve());
        });
      } else {
        // Cas 3 : invalide → ignorer
        console.warn("Le fichier fourni n'est ni audio ni vidéo, ignoré :", contentType);
        musicPath = null;
      }
    }

    // 3️⃣ Générer la vidéo complète avec transitions et texte animé
    const txtFile = path.join(tmpDir, "file_list.txt");
    const fadeDuration = 1;
    let txtContent = "";
    imageFiles.forEach((f, i) => {
      txtContent += `file '${f}'\nduration 3\n`;
      if (i === imageFiles.length - 1) txtContent += `file '${f}'\n`;
    });
    fs.writeFileSync(txtFile, txtContent);

    const ffmpegArgs = [
      "-f", "concat",
      "-safe", "0",
      "-i", txtFile
    ];

    if (musicPath) {
      ffmpegArgs.push("-i", musicPath);
    }

    ffmpegArgs.push(
      "-vf",
      `
      zoompan=z='min(zoom+0.0005,1.5)':d=75,
      fade=t=in:st=0:d=${fadeDuration},
      drawtext=fontfile=${fontPath}:
      text='${title} - ${price}':
      fontsize=48:fontcolor=white:
      x=(w-text_w)/2:y=h-100:
      alpha='if(lt(t,0.5),0,if(lt(t,2),(t-0.5)/1.5,1))'
      `.replace(/\s+/g, ''),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      videoPath
    );

    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, ffmpegArgs, (err, stdout, stderr) => {
        if (err) {
          console.error(stderr);
          reject(err);
        } else resolve(stdout);
      });
    });

    // 4️⃣ Découper la vidéo à 15 secondes
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        "-i", videoPath,
        "-ss", "0",
        "-t", "15",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        finalVideoPath
      ], (err) => err ? reject(err) : resolve());
    });

    // 5️⃣ Créer une miniature
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        "-i", finalVideoPath,
        "-ss", "00:00:01.000",
        "-vframes", "1",
        thumbnailPath
      ], (err) => err ? reject(err) : resolve());
    });

    // 6️⃣ Upload vidéo sur Supabase
    const videoData = fs.readFileSync(finalVideoPath);
    const videoFileName = `products/${Date.now()}.mp4`;
    const { error: errVideo } = await supabase.storage
      .from("videos")
      .upload(videoFileName, videoData, { contentType: "video/mp4" });
    if (errVideo) throw errVideo;

    // 7️⃣ Upload miniature sur Supabase
    const thumbData = fs.readFileSync(thumbnailPath);
    const thumbFileName = `products/thumb_${Date.now()}.jpg`;
    const { error: errThumb } = await supabase.storage
      .from("videos")
      .upload(thumbFileName, thumbData, { contentType: "image/jpeg" });
    if (errThumb) throw errThumb;

    // 8️⃣ Récupérer les URLs publiques
    const { data: { publicUrl: videoUrl } } = supabase.storage.from("videos").getPublicUrl(videoFileName);
    const { data: { publicUrl: thumbUrl } } = supabase.storage.from("videos").getPublicUrl(thumbFileName);

    // 9️⃣ Nettoyage des fichiers temporaires
    [videoPath, finalVideoPath, thumbnailPath, ...imageFiles].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    if (musicPath && fs.existsSync(musicPath)) fs.unlinkSync(musicPath);

    return {
      statusCode: 200,
      body: JSON.stringify({ videoUrl, thumbUrl })
    };

  } catch (error) {
    console.error("Error generating video:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}

