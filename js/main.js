// import { VinylPlayer } from './services/VinylPlayer.js';

const sendAnalytics = (data = '') => {
    if (window.location.protocol === 'file:') return;
    fetch(`backend/analytics.php?data=${encodeURIComponent(data)}`)
        .then(response => response.text())
        .then(data => {
            //console.log('Analytics sent:', data);
        })
        .catch(error => {
            console.error('Analytics error:', error);
        });
};

// Отправляем базовую аналитику при загрузке
sendAnalytics();

// Инициализируем плеер
document.addEventListener("DOMContentLoaded", () => new VinylPlayer());

function displayLocalTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('clock').innerText = timeString;
}

// Update the time every second
setInterval(displayLocalTime, 1000);

// Run the function once when the page loads
displayLocalTime();



