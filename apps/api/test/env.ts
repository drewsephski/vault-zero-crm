const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
