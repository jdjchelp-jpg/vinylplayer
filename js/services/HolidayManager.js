class HolidayManager {
    constructor() {
        this.holidays = [
            {
                name: "Christmas",
                month: 11, // December (0-indexed)
                day: 25,
                playlistId: "PL14F56380359E80C4", // Classic Christmas Songs
                icon: "🎄"
            },
            {
                name: "Halloween",
                month: 9, // October
                day: 31,
                playlistId: "PL05E16292F550FA74", // Halloween Songs
                icon: "🎃"
            },
            {
                name: "New Year's Eve",
                month: 11, // December
                day: 31,
                playlistId: "PL59FEE129ADFF20E2", // Party Songs
                icon: "🎉"
            },
            {
                name: "Valentine's Day",
                month: 1, // February
                day: 14,
                playlistId: "PLCD0445C57F2B7F41", // Love Songs
                icon: "❤️"
            }
        ];
    }

    checkHoliday() {
        const today = new Date();
        const month = today.getMonth();
        const day = today.getDate();

        return this.holidays.find(h => h.month === month && h.day === day) || null;
    }

    getHolidayPlaylist(holiday) {
        return holiday ? holiday.playlistId : null;
    }
}
