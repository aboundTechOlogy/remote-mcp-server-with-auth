export interface WorkerCodeValidationResult {
	isValid: boolean;
	error?: string;
}

/**
 * Validate worker code for security issues and malicious patterns
 */
export function validateWorkerCode(code: string): WorkerCodeValidationResult {
	const trimmedCode = code.trim();

	// Check for empty code
	if (!trimmedCode) {
		return { isValid: false, error: "Worker code cannot be empty" };
	}

	// Check for dangerous patterns that could be malicious
	const dangerousPatterns = [
		/\beval\s*\(/i,
		/\bFunction\s*\(/i,
		/process\.exit/i,
		/process\.kill/i,
		/child_process/i,
		/require\s*\(\s*['"`]fs['"`]\s*\)/i,
		/require\s*\(\s*['"`]path['"`]\s*\)/i,
		/require\s*\(\s*['"`]os['"`]\s*\)/i,
		/require\s*\(\s*['"`]crypto['"`]\s*\)/i,
		/import\s+.*\s+from\s+['"`]fs['"`]/i,
		/import\s+.*\s+from\s+['"`]path['"`]/i,
		/import\s+.*\s+from\s+['"`]os['"`]/i,
		/\.exec\s*\(/i,
		/\.spawn\s*\(/i,
		/new\s+Function\s*\(/i,
		/document\.write/i,
		/document\.writeln/i,
		/innerHTML\s*=/i,
		/outerHTML\s*=/i,
		/\$\{.*\}/,  // Template literal injection
		/javascript:/i,
		/vbscript:/i,
		/data:\s*text\/html/i,
	];

	for (const pattern of dangerousPatterns) {
		if (pattern.test(code)) {
			return { isValid: false, error: "Code contains potentially dangerous patterns" };
		}
	}

	// Check for excessively large code (>1MB)
	if (code.length > 1024 * 1024) {
		return { isValid: false, error: "Code is too large (maximum 1MB allowed)" };
	}

	return { isValid: true };
}

/**
 * Log deployment operations for audit trail
 */
export function logDeploymentOperation(
	operation: string,
	workerName: string,
	userName: string,
	success: boolean,
	details?: any
): void {
	const logEntry = {
		timestamp: new Date().toISOString(),
		operation,
		workerName,
		userName,
		success,
		details
	};

	// In production, this would go to a proper logging service
	console.log('[DEPLOYMENT_AUDIT]', JSON.stringify(logEntry));
}