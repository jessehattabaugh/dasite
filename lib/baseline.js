import fs from 'fs/promises';
import path from 'path';

/**
 * Get the snapshot directory for a given test type
 * @param {string} testType - Type of test (playwright, lighthouse, axe, etc)
 * @param {string} [baseDir] - Base directory
 * @returns {Promise<string>} - Path to snapshot directory
 */
export async function getSnapshotDir(testType, baseDir) {
	const baseDirectory = baseDir || path.join(process.cwd(), 'dasite');
	const snapshotDir = path.join(baseDirectory, 'snapshots', testType);
	await fs.mkdir(snapshotDir, { recursive: true });
	return snapshotDir;
}

/**
 * Accept current snapshots as baselines
 * @param {string} testType - Type of test (playwright, lighthouse, axe, etc)
 * @param {string} [baseDir] - Base directory
 * @returns {Promise<number>} - Number of accepted snapshots
 */
export async function acceptSnapshots(testType = 'playwright', baseDir) {
	console.log(`Accepting current ${testType} snapshots as baselines...`);
	let accepted = 0;

	try {
		// Check snapshots directory first (traditional approach)
		const snapshotsDir = await getSnapshotDir(testType, baseDir);
		const files = await fs.readdir(snapshotsDir);
		const tmpScreenshots = files.filter((file) => file.endsWith('.tmp.png'));

		if (tmpScreenshots.length > 0) {
			for (const tmpFile of tmpScreenshots) {
				const sourcePath = path.join(snapshotsDir, tmpFile);
				const targetPath = path.join(snapshotsDir, tmpFile.replace('.tmp.png', '.png'));
				await fs.copyFile(sourcePath, targetPath);
				accepted++;
			}
		} else {
			// Also check for current.png files in URL directories
			const dasiteDir = baseDir || path.join(process.cwd(), 'dasite');

			try {
				const entries = await fs.readdir(dasiteDir, { withFileTypes: true });
				const directories = entries
					.filter((entry) => entry.isDirectory() && entry.name !== 'snapshots')
					.map((entry) => entry.name);

				for (const dir of directories) {
					const urlDir = path.join(dasiteDir, dir);
					const currentPath = path.join(urlDir, 'current.png');
					const baselinePath = path.join(urlDir, 'baseline.png');

					try {
						await fs.access(currentPath);
						await fs.copyFile(currentPath, baselinePath);
						accepted++;
					} catch (err) {
						// Skip if file doesn't exist
					}
				}
			} catch (err) {
				// Handle case where dasite directory doesn't exist or can't be read
			}
		}

		// Print the appropriate message based on results
		if (accepted > 0) {
			console.log(`Accepted ${accepted} snapshots as new baselines.`);
		} else {
			console.log('No snapshots found to accept as baselines.');
		}

		return accepted;
	} catch (error) {
		console.error('Error accepting snapshots:', error.message);
		return 0;
	}
}
