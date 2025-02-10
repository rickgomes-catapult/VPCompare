import * as vscode from 'vscode';
import * as path from 'path';

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

    if (image1 && image2) {
      const panel = vscode.window.createWebviewPanel(
        'vpCompare',
        'VP Compare',
        vscode.ViewColumn.One,
        {
          enableScripts: true
        }
      );

      panel.webview.html = getWebviewContent(image1, image2);

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

function getWebviewContent(image1: string, image2: string): string {
  return `
    <html>
      <body>
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
          <img id="image" src="data:image/png;base64,${image1}" style="width: 100%;" />
        </div>
        <button onclick="replaceImage()">Replace Expected Image with Actual Image</button>
        <script>
          const vscode = acquireVsCodeApi();
          let showFirstImage = true;
          setInterval(() => {
            showFirstImage = !showFirstImage;
            document.getElementById('image').src = showFirstImage ? 'data:image/png;base64,${image1}' : 'data:image/png;base64,${image2}';
          }, 2000);
          function replaceImage() {
            vscode.postMessage({ command: 'replaceImage' });
          }
        </script>
      </body>
    </html>
  `;
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
