import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { writeWorkspaceFile, writeBookFile } from '../lib/fs/jsonStore';
import { sampleWorkspace, sampleBook } from '../samples/sampleData';
import { loadWorkspace, saveWorkspace } from '../lib/data/workspaceService';

const main = async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'sheet-up-ws-'));
  const workspacePath = join(baseDir, 'workspace.json');
  const bookPath = join(baseDir, 'books', 'book-001.json');

  // 初期データを保存
  await writeWorkspaceFile(workspacePath, sampleWorkspace);
  await writeBookFile(bookPath, sampleBook);

  // ロードして書き換え
  const snapshot = await loadWorkspace(workspacePath);
  snapshot.workspace.data.workspace.name = 'Updated Workspace Name';
  snapshot.books[0].data.book.name = 'Updated Book Name';

  await saveWorkspace(snapshot);

  const reloaded = await loadWorkspace(workspacePath);

  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Workspace name:', reloaded.workspace.data.workspace.name);
  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Book name:', reloaded.books[0].data.book.name);
  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Snapshot saved under:', baseDir);
};

main().catch((err) => {
  // eslint-disable-next-line no-console -- CLI feedback
  console.error('Workspace demo failed:', err);
  process.exitCode = 1;
});
