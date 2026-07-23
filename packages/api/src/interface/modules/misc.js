export default {
	async license() {
		return (await this.latestApi().license()).license
	},
	async sysinfo() {
		return (await this.latestApi().sysinfo())
	},
	async health() {
		return (await this.latestApi().health())
	}
}