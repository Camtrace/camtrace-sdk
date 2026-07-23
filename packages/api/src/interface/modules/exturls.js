export default {
    async extUrls() {
        return (await this.latestApi().exturls()).exturls
    },
    async extUrl(id) {
        return (await this.latestApi().exturl(id))
    },
    async triggerExtUrl(id) {
        return (await this.latestApi().exturlTrigger(id))
    }
}