const API_BASE_URL = "/api";
const API_KEY = "1d1296c572361241a2935363bac9aee3e6054252a24b9de076485d2c58829b21";
export async function fetchAllCoachesAnalytics() {
    const response = await fetch(`${API_BASE_URL}/coaches/all`, {
        headers: {
            "x-api-key": API_KEY,
        },
    });
    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }
    const data = await response.json();
    return data.rows;
}
