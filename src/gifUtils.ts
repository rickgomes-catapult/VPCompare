import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp = require('sharp');

export async function createGif(imagePath1: string, imagePath2: string): Promise<string> {
  try {
    const image1 = await sharp(imagePath1).toBuffer();
    const image2 = await sharp(imagePath2).toBuffer();

    const metadata1 = await sharp(imagePath1).metadata();
    const metadata2 = await sharp(imagePath2).metadata();

    const width = Math.max(metadata1.width!, metadata2.width!);
    const height = Math.max(metadata1.height!, metadata2.height!);

    const tempDir = os.tmpdir();
    const tempGifPath1 = path.join(tempDir, path.basename(imagePath1, path.extname(imagePath1)) + '.gif');
    const tempGifPath2 = path.join(tempDir, path.basename(imagePath2, path.extname(imagePath2)) + '.gif');

    await sharp(image1).resize(width, height).gif().toFile(tempGifPath1);
    await sharp(image2).resize(width, height).gif().toFile(tempGifPath2);

    console.log(`Temporary GIFs created at ${tempGifPath1} and ${tempGifPath2}`);

    const gifPath = path.join(tempDir, 'output.gif');

    return new Promise((resolve, reject) => {
      exec(`gifsicle --delay=200 --loop --colors 256 ${tempGifPath1} ${tempGifPath2} > ${gifPath}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing gifsicle: ${stderr}`);
          reject(error);
        } else {
          console.log(`GIF created at ${gifPath}`);
          resolve(gifPath);
        }
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error creating GIF: ${error.message}`);
    } else {
      console.error(`Error creating GIF: ${error}`);
    }
    throw error;
  }
}
