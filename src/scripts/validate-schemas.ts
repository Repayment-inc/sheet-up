import { validateBookFile, validateWorkspaceFile } from '../lib/schemaValidator';
import { sampleBook, sampleWorkspace } from '../samples/sampleData';

const main = () => {
  const workspaceResult = validateWorkspaceFile(sampleWorkspace);
  if (!workspaceResult.valid) {
    throw new Error(`Workspace sample invalid.\n${workspaceResult.errors.join('\n')}`);
  }

  const bookResult = validateBookFile(sampleBook);
  if (!bookResult.valid) {
    throw new Error(`Book sample invalid.\n${bookResult.errors.join('\n')}`);
  }
  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Sample workspace and book data passed schema validation.');
};

main();
