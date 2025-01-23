import { note, outro } from '@clack/prompts';
import chalk from 'chalk';
import dedent from 'dedent';
import type { PackageManager } from '../types/pm.js';

export default function completeSetup(
  projectName: string,
  packageManager: PackageManager
) {
  const nextSteps = dedent`
    cd ${projectName}
    ${packageManager.runCommand} install
    ${packageManager.runCommand} start

    ${chalk.blue('[ios]')}
    ${packageManager.dlxCommand} pod-install
    ${packageManager.runCommand} run ios
    
    ${chalk.green('[android]')}
    ${packageManager.runCommand} react-native run-android
  `;

  note(nextSteps, 'Next steps');
  outro('Done.');
}
