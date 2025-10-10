import { assertBookFile, assertWorkspaceFile } from '../lib/schemaValidator';
import { sampleBook, sampleWorkspace } from '../samples/sampleData';

const main = () => {
  assertWorkspaceFile(sampleWorkspace);
  assertBookFile(sampleBook);
  // eslint-disable-next-line no-console -- CLI feedback
  console.log('Sample workspace and book data passed schema validation.');
};

main();
