const express = require('express');
const path = require('path');
const mongoose = require('mongoose');  // Changed from MongoClient
require('dotenv').config();
const axios = require('axios');

// Import routers
const suggestionsRouter = require('./routes/suggestions');

// Initialize Express app
const app = express();
const portNumber = process.argv[2] || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Connect to MongoDB using Mongoose
mongoose.connect(process.env.MONGO_CONNECTION_STRING)
.then(() => console.log('✅ Connected to MongoDB with Mongoose'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// Define Mongoose Schema and Model
const suggestionSchema = new mongoose.Schema({
    city: {
        type: String,
        required: true,
        trim: true
    },
    weather: {
        condition: String,
        description: String,
        icon: String,
        temp: Number,
        feels_like: Number,
        humidity: Number,
        wind_speed: Number,
        city: String,
        country: String
    },
    outfit: [String],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create Mongoose Model
const Suggestion = mongoose.model('Suggestion', suggestionSchema);

// API function to get weather data
async function getOpenWeatherData(city) {
    const API_KEY = process.env.WEATHER_API_KEY;
    
    try {
        // Get the location coordinates
        const coordinates = await axios.get(
            `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`
        );

        if (!coordinates.data || coordinates.data.length === 0) {
            return { success: false, message: 'City not found' };
        }

        const { lat, lon } = coordinates.data[0];

        // Get the weather data
        const weatherResponse = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=imperial`
        );
        const weather = weatherResponse.data;
        
        return {
            success: true,
            data: {
                condition: weather.weather[0].main,
                description: weather.weather[0].description,
                icon: `http://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`,
                temp: Math.round(weather.main.temp),
                feels_like: Math.round(weather.main.feels_like),
                humidity: weather.main.humidity,
                wind_speed: Math.round(weather.wind.speed * 10) / 10, // 1 decimal place
                city: weather.name,
                country: weather.sys.country
            }
        };
    } catch (error) {
        console.error('Error fetching weather data:', error.response?.data || error.message);
        return { success: false, message: 'Error fetching weather data' };
    }
}

// Outfit generation function
function getOutfitForToday(weather) {
    const outfit = [];
    const condition = weather.condition.toLowerCase();
    const temp = weather.temp;
    const wind = weather.wind_speed;
    
    // Temperature-based recommendations
    if (temp < 40) {
        outfit.push("🧥 Heavy winter coat + Sweater");
        outfit.push("🧣 & 🧤 Scarf + gloves");
        outfit.push("🧦 Thermal layers");
    } else if (temp < 50) {
        outfit.push("🧥 Medium jacket + Long sleeve shirt");
        outfit.push("👖 Long pants");
        outfit.push("🧤 Light gloves recommended");
    } else if (temp < 70) {
        outfit.push("👕 Long sleeve shirt or Hoodie");
        outfit.push("🧥 Light jacket or sweater");
        outfit.push("👖 Comfortable pants");
        outfit.push("👟 Sneakers");
    } else {
        outfit.push("🎽 T-shirt or tank top");
        outfit.push("🩳 Shorts, skirt, or light pants");
        outfit.push("🥿 Sandals, heels, or breathable shoes");
    }
    
    // Extreme heat warning
    if (temp > 85) {
        outfit.push("💧 Extreme heat: Stay hydrated!");
        outfit.push("Avoid strenuous outdoor activities during peak sun hours.");
    }

    // Sun protection
    if (temp > 70 && (condition.includes('clear') || condition.includes('sun'))) {
        outfit.push("🕶 Sunglasses");
        outfit.push("🧴 Sunscreen SPF 30+");
        outfit.push("🧢 Hat");
    }
    
    // Rain protection
    if (condition.includes('rain') || condition.includes('drizzle')) {
        outfit.push("🌂 Umbrella or raincoat");
        outfit.push("👢 Rain Boots");
    }
    
    // Cloudy weather
    if (condition.includes('cloud')) {
        outfit.push("☁️ Light layers for variable weather");
    }

    // Windy conditions
    if (wind > 15) {
        outfit.push("💨 Windy conditions: Windbreaker");
        outfit.push("Secure loose clothing and accessories");
    }
    
    // High humidity
    if (weather.humidity > 70) {
        outfit.push("💦 High humidity: Choose breathable fabrics");
    }
    
    return outfit;
}

// Routes
app.use('/', suggestionsRouter(Suggestion, getOpenWeatherData, getOutfitForToday));

// Start server
app.listen(portNumber, () => {
    console.log(`✅ Server running at http://localhost:${portNumber}`);
    console.log(`Press Ctrl+C to stop the server`);
});

// Export for testing
module.exports = {
    app,
    Suggestion,
    getOpenWeatherData,
    getOutfitForToday
};