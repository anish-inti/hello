// Import necessary libraries
import Chart from 'chart.js/auto';
import WaveSurfer from 'wavesurfer.js';
import { toast, Toastify } from 'toastify-js';
import 'toastify-js/src/toastify.css';
import Shepherd from 'shepherd.js';
import 'shepherd.js/dist/css/shepherd.css';

// Initialize global variables
let detectedEmotion = null;
let probabilities = null;
let isLoading = false;
let error = null;
let audioData = null;
let fileName = '';
let isPlaying = false;
let volume = 1;
let isMuted = false;
let emotionHistory = [];
let isRealTimeMode = false;
let highScores = JSON.parse(localStorage.getItem('highScores')) || [];

let wavesurfer = null;
let mediaRecorder = null;

// DOM elements
const fileInput = document.getElementById('fileInput');
const waveformContainer = document.getElementById('waveform');
const canvas = document.getElementById('visualizer');
const playPauseButton = document.getElementById('playPauseButton');
const volumeSlider = document.getElementById('volumeSlider');
const muteButton = document.getElementById('muteButton');
const realTimeButton = document.getElementById('realTimeButton');
const shareButton = document.getElementById('shareButton');
const resultsContainer = document.getElementById('results');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');

// Event listeners
fileInput.addEventListener('change', handleFileUpload);
document.addEventListener('dragover', handleDragOver);
document.addEventListener('drop', handleDrop);
playPauseButton.addEventListener('click', togglePlayPause);
volumeSlider.addEventListener('input', handleVolumeChange);
muteButton.addEventListener('click', toggleMute);
realTimeButton.addEventListener('click', toggleRealTimeMode);
shareButton.addEventListener('click', shareResults);

// File upload handler
async function handleFileUpload(event) {
    let file;
    if (event.dataTransfer) {
        file = event.dataTransfer.files[0];
    } else {
        file = event.target.files[0];
    }

    if (!file) return;

    if (!file.type.startsWith('audio/')) {
        toast.error('Please upload an audio file');
        return;
    }

    fileName = file.name;
    isLoading = true;
    error = null;
    updateUI();

    const formData = new FormData();
    formData.append('audio', file);

    try {
        const response = await fetch('/api/analyze-emotion', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to analyze audio');
        }

        const data = await response.json();
        detectedEmotion = data.emotion;
        probabilities = data.probabilities;
        audioData = URL.createObjectURL(file);
        updateEmotionHistory(data.emotion);
        toast.success('Audio analysis complete');
    } catch (err) {
        error = err.message;
        toast.error(err.message);
    } finally {
        isLoading = false;
        updateUI();
    }
}

// UI update function
function updateUI() {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    errorDisplay.textContent = error || '';
    
    if (audioData) {
        initWavesurfer();
        initVisualizer();
    }

    if (detectedEmotion) {
        displayResults();
    }
}

// Initialize WaveSurfer
function initWavesurfer() {
    if (wavesurfer) {
        wavesurfer.destroy();
    }

    wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: '#4F4A85',
        progressColor: '#383351',
        cursorColor: '#383351',
        barWidth: 3,
        barRadius: 3,
        responsive: true,
        height: 150,
    });

    wavesurfer.load(audioData);

    wavesurfer.on('play', () => isPlaying = true);
    wavesurfer.on('pause', () => isPlaying = false);
}

// Initialize audio visualizer
function initVisualizer() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const sourceNode = audioContext.createMediaElementSource(wavesurfer.media);
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);

    const ctx = canvas.getContext('2d');
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        const barWidth = (WIDTH / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;

            const r = barHeight + (25 * (i / bufferLength));
            const g = 250 * (i / bufferLength);
            const b = 50;

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    draw();
}

// Display analysis results
function displayResults() {
    resultsContainer.innerHTML = `
        <h2>Detected Emotion: ${detectedEmotion}</h2>
        <canvas id="emotionChart"></canvas>
        <canvas id="historyChart"></canvas>
    `;

    const pieCtx = document.getElementById('emotionChart').getContext('2d');
    new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(probabilities),
            datasets: [{
                data: Object.values(probabilities),
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
                ],
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
            },
        },
    });

    const lineCtx = document.getElementById('historyChart').getContext('2d');
    new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: emotionHistory.map(entry => entry.time.toLocaleTimeString()),
            datasets: [{
                label: 'Emotion over time',
                data: emotionHistory.map(entry => entry.emotion),
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Playback control functions
function togglePlayPause() {
    if (wavesurfer) {
        wavesurfer.playPause();
        isPlaying = !isPlaying;
        playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
    }
}

function handleVolumeChange(event) {
    volume = parseFloat(event.target.value);
    if (wavesurfer) {
        wavesurfer.setVolume(volume);
    }
}

function toggleMute() {
    isMuted = !isMuted;
    if (wavesurfer) {
        wavesurfer.setMute(isMuted);
    }
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
}

// Real-time detection functions
function toggleRealTimeMode() {
    if (isRealTimeMode) {
        stopRealTimeDetection();
    } else {
        startRealTimeDetection();
    }
}

function startRealTimeDetection() {
    isRealTimeMode = true;
    realTimeButton.textContent = 'Stop Real-Time Detection';
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = handleRealTimeAudioData;
            mediaRecorder.start(1000); // Capture audio every second
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
            toast.error('Unable to access microphone');
        });
}

function stopRealTimeDetection() {
    isRealTimeMode = false;
    realTimeButton.textContent = 'Start Real-Time Detection';
    if (mediaRecorder) {
        mediaRecorder.stop();
    }
}

async function handleRealTimeAudioData(event) {
    const audioBlob = event.data;
    const formData = new FormData();
    formData.append('audio', audioBlob);

    try {
        const response = await fetch('/api/analyze-emotion', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to analyze audio');
        }

        const data = await response.json();
        detectedEmotion = data.emotion;
        probabilities = data.probabilities;
        updateEmotionHistory(data.emotion);
        updateUI();
    } catch (err) {
        console.error('Error in real-time analysis:', err);
    }
}

// Helper functions
function updateEmotionHistory(emotion) {
    emotionHistory.push({ time: new Date(), emotion });
}

function shareResults() {
    if (detectedEmotion) {
        const shareText = `I just analyzed my speech emotion! The detected emotion is: ${detectedEmotion}. Try it yourself!`;
        const shareUrl = window.location.href;

        if (navigator.share) {
            navigator.share({
                title: 'My Speech Emotion Analysis',
                text: shareText,
                url: shareUrl,
            })
            .then(() => console.log('Successful share'))
            .catch((error) => console.log('Error sharing', error));
        } else {
            // Fallback for browsers that don't support Web Share API
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
        }
    } else {
        toast.warn('Analyze an audio file first to share results');
    }
}

// Tour functionality
function startTour() {
    const tour = new Shepherd.Tour({
        defaultStepOptions: {
            cancelIcon: {
                enabled: true
            },
            classes: 'shepherd-theme-default'
        }
    });

    tour.addStep({
        id: 'welcome',
        text: 'Welcome to the Audio Emotion Analyzer! Let\'s take a quick tour.',
        buttons: [
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    tour.addStep({
        id: 'upload',
        text: 'Start by uploading an audio file here or drag and drop it.',
        attachTo: {
            element: fileInput,
            on: 'bottom'
        },
        buttons: [
            {
                text: 'Next',
                action: tour.next
            }
        ]
    });

    // Add more steps as needed

    tour.start();
}

// Initialize the application
function init() {
    // Set up drag and drop functionality
    const dropZone = document.querySelector('.drop-zone');
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('drop', handleDrop);

    // Set up tour button
    const tourButton = document.getElementById('tourButton');
    tourButton.addEventListener('click', startTour);

    // Initialize Toastify
    Toastify.init();
}

// Run initialization when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);
