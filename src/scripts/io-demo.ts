import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  writeWorkspaceFile,
  readWorkspaceFile,
  writeBookFile,
  readBookFile
} from '../lib/fs/jsonStore';
import { sampleWorkspace, sampleBook } from '../samples/sampleData';

const main = async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'sheet-up-'));
  const workspacePath = join(baseDir, 'workspace.json');
  const bookPath = join(baseDir, 'books', 'book-001.json');

  await writeWorkspaceFile(workspacePath, sampleWorkspace);
  await writeBookFile(bookPath, sampleBook);

  const loadedWorkspace = await readWorkspaceFile(workspacePath);
  const loadedBook = await readBookFile(bookPath);

  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Workspace name:', loadedWorkspace.workspace.name);
  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Sheets count:', loadedBook.sheets.length);
  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Data stored under:', baseDir);
};

main().catch((err) => {
  // eslint-disable-next-line no-console -- CLI feedback
  console.error('I/O demo failed:', err);
  process.exitCode = 1;
});
