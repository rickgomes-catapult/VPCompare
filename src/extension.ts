import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import sharp = require('sharp');
import { DOMParser } from 'xmldom';
import { createGif } from './gifUtils';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('vpCompare.compareImages', async () => {
    const expected = await vscode.window.showOpenDialog({ 
      canSelectMany: false, 
      filters: { 'VP file': [''] },
      openLabel: 'Please select Expected VP'
    });
    if (!expected || expected.length !== 1) {
      vscode.window.showErrorMessage('Please select the Expected VP.');
      return;
    }
    
    const actual = await vscode.window.showOpenDialog({ 
      canSelectMany: false, 
      openLabel: 'Please select Actual VP or Image'
     });
    if (!actual || actual.length !== 1) {
      vscode.window.showErrorMessage('Please select the Actual VP or Image.');
      return;
    }

    const image1 = await extractImageFromFile(expected[0].fsPath);
    const image2 = await extractImageOrFile(actual[0].fsPath);
    const mask = await extractMask(expected[0].fsPath);

    if (image1 && image2) {
      const maskedImage1 = await generateImageWithMask(image1, mask, path.basename(expected[0].fsPath)+'.png');
      const maskedImage2 = await generateImageWithMask(image2, mask, path.basename(actual[0].fsPath)+'.png');
      const gifPath = await createGif(maskedImage1, maskedImage2);

      const panel = vscode.window.createWebviewPanel(
        'vpCompare',
        'VP Compare',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(path.dirname(gifPath))]
        }
      );

      const gifUri = vscode.Uri.file(gifPath);
      panel.webview.html = `<img src="${panel.webview.asWebviewUri(gifUri)}" />`;

      panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'replaceImage') {
          await replaceImageInFile(expected[0].fsPath, image2);
          vscode.window.showInformationMessage('Expected image replaced with actual image.');
        }
      });
    } else {
      vscode.window.showErrorMessage('Failed to extract images from the selected files.');
    }
  });

  context.subscriptions.push(disposable);
}

async function extractImageFromFile(filePath: string): Promise<string | null> {
  const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const xml = content.toString();
  const startTag = '<Verification ';
  const endTag = '<Mask';
  const startIndex = xml.indexOf(startTag);
  const endIndex = xml.indexOf(endTag);

  if (startIndex !== -1 && endIndex !== -1) {
    const temp = xml.substring(startIndex, endIndex).trim();
    const base64Image = temp.substring(temp.indexOf('>') + 1).trim();
    return base64Image;
  } else {
    return null;
  }
}

async function extractImageOrFile(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '') {
    return extractImageFromFile(filePath);
  } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return Buffer.from(content).toString('base64');
  } else {
    return null;
  }
}

async function extractMask(filePath: string): Promise<string | null> {
  const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const xml = content.toString();
  const maskStartIndex = xml.indexOf('<Mask>');
  const maskEndIndex = xml.indexOf('</Mask>');

  if (maskStartIndex > 0 && maskEndIndex > 0) {
    return xml.substring(maskStartIndex + '<Mask>'.length, maskEndIndex + '</Mask>'.length).trim();
  }

  return null;
}

async function generateImageWithMask(image: string, mask: string | null, originalFileName: string): Promise<string> {
  const imageBuffer = Buffer.from(image, 'base64');
  let img = sharp(imageBuffer);

  if (mask) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(mask, "text/xml");
    const rect = xmlDoc.getElementsByTagName("Rect")[0];

    if (rect) {
      const x = parseInt(rect.getAttribute("x") || "0");
      const y = parseInt(rect.getAttribute("y") || "0");
      const width = parseInt(rect.getAttribute("width") || "0");
      const height = parseInt(rect.getAttribute("height") || "0");
      const type = rect.getAttribute("type");

      const overlay = sharp({
        create: {
          width: width,
          height: height,
          channels: 4,
          background: type === 'negative' ? { r: 0, g: 0, b: 0, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 }
        }
      }).png();

      if (type === 'positive') {
        overlay.extend({
          top: y,
          left: x,
          bottom: await img.metadata().then((meta: sharp.Metadata) => meta.height! - y - height),
          right: await img.metadata().then((meta: sharp.Metadata) => meta.width! - x - width),
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }).composite([{ input: Buffer.from(`<svg><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="2"/></svg>`), blend: 'over' }]);
      }

      img = img.composite([{ input: await overlay.toBuffer(), top: y, left: x }]);
    }
  }

  const outputFilePath = path.join(os.tmpdir(), originalFileName);
  await img.toFile(outputFilePath);

  return outputFilePath;
}

async function replaceImageInFile(filePath: string, newImage: string): Promise<void> {
  const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  let xml = content.toString();
  const startTag = '<Verification ';
  const endTag = '<Mask';
  const startIndex = xml.indexOf(startTag);
  const endIndex = xml.indexOf(endTag);

  if (startIndex !== -1 && endIndex !== -1) {
    const temp = xml.substring(startIndex, endIndex).trim();
    const base64Image = temp.substring(temp.indexOf('>') + 1).trim();
    xml = xml.replace(base64Image, newImage);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(xml));
  }
}

export function deactivate() {}
