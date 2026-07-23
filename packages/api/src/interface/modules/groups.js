export default {
    async groups() {
        return (await this.latestApi().groups()).groups
    },
    async group(id) {
        return (await this.latestApi().group(id))
    }
}