const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const portNumber = process.argv[2] || 3000;
const axios = require('axios');

const uri = process.env.MONGO_CONNECTION_STRING;
const client = new MongoClient(uri);
const databaseName = 'PackSmartDB';
const collectionName = 'suggestions';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

async function getOpenWeatherData(city) {
    const API_KEY = process.env.WEATHER_API_KEY;
    
    try {
        // get the location coordinates
        const coordinates = await axios.get(`http://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${API_KEY}`);

        if (!coordinates.data || coordinates.data.length === 0) {
            return { success: false, message: 'City not found' };
        }

        const {lat, lon} = coordinates.data[0];

        // get the weather data
        const weatherResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=imperial`);

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
                wind_speed: weather.wind.speed,
                city: weather.name,
                country: weather.sys.country
            }
        };
    } catch (error) {
        console.error('Error fetching weather data:', error.response?.data || error.message);
        return { success: false, message: 'Failed to fetch weather data' };
    }
}

app.get('/', (req, res) => {
    res.render('index', { 
        todayDate: new Date().toISOString().split('T')[0] 
    });
});


app.post('/getOutfit', async (req, res) => {
    const { city } = req.body; // Only need city now
    
    try {
        console.log('Getting outfit for:', city);
       
        if (!city) {
            return res.render('index', {
                todayDate: new Date().toISOString().split('T')[0],
                error: 'City is required'
            });
        }

        // Get TODAY's weather
        const weatherData = await getOpenWeatherData(city);

        if (!weatherData.success) {
            return res.render('index', {
                todayDate: new Date().toISOString().split('T')[0],
                error: weatherData.message
            });
        }

        // Generate outfit advice based on today's weather
        const outfitAdvice = getOutfitForToday(weatherData.data);
        
        // Save to MongoDB (optional)
        try {
            const database = client.db(databaseName);
            const collection = database.collection(collectionName);
            
            await collection.insertOne({
                city: city,
                weather: weatherData.data,
                outfit: outfitAdvice,
                createdAt: new Date()
            });
        } catch (dbError) {
            console.log('Note: Could not save to database, continuing...');
        }
        

        res.render('getOutfit', {
            city,
            weather: weatherData.data,
            outfit: outfitAdvice,
            today: new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        });

    } catch (error) {
        console.error('Error processing request:', error);
        res.render('index', {
            todayDate: new Date().toISOString().split('T')[0],
            error: 'Something went wrong. Please try again.'
        });
    }
});

function getOutfitForToday(weather) {
    const outfit = [];
    const condition = weather.condition.toLowerCase();
    const temp = weather.temp;
    const wind = weather.wind_speed;
    
    // Temperature-based advice
    if (temp < 32) {
        outfit.push("🧥 Heavy winter coat");
        outfit.push("🧣 Scarf and gloves");
        outfit.push("🥾 Insulated boots");
        outfit.push("🧦 Thermal layers");
    } else if (temp < 50) {
        outfit.push("🧥 Light to medium jacket");
        outfit.push("👖 Long pants or jeans");
        outfit.push("👟 Closed-toe shoes");
        if (temp < 40) outfit.push("🧤 Light gloves");
    } else if (temp < 70) {
        outfit.push("👕 Long sleeve shirt");
        outfit.push("🧥 Light jacket or sweater");
        outfit.push("👖 Comfortable pants");
    } else {
        outfit.push("🎽 T-shirt or tank top");
        outfit.push("🩳 Shorts or light pants");
        outfit.push("👡 Sandals or breathable shoes");
    }
    
    // Weather condition advice
    if (condition.includes('clear') || condition.includes('sun')) {
        outfit.push("🕶️ Sunglasses");
        outfit.push("🧴 Sunscreen SPF 30+");
        if (temp > 75) outfit.push("🧢 Hat or cap");
    }
    
    if (condition.includes('rain') || condition.includes('drizzle')) {
        outfit.push("☔ Umbrella or raincoat");
        outfit.push("👢 Waterproof shoes");
        outfit.push("🧥 Water-resistant jacket");
    }
    
    if (condition.includes('snow') || condition.includes('sleet')) {
        outfit.push("🧤 Winter gloves");
        outfit.push("🧦 Wool socks");
        outfit.push("🧥 Waterproof outer layer");
    }
    
    if (condition.includes('cloud')) {
        outfit.push("🧥 Light layer - might change");
    }
    
    if (wind > 15) {
        outfit.push("💨 Windbreaker or tight-fitting layers");
    }
    
    // Special notes
    if (temp > 85) {
        outfit.push("💧 Stay hydrated!");
        outfit.push("🌬️ Light, breathable fabrics");
    }
    
    if (weather.humidity > 70) {
        outfit.push("💨 Moisture-wicking fabrics");
    }
    
    return outfit;
}

app.get('/history', async (req, res) => {
    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        
        // Get all cities with counts
        const allOutfits = await collection.find({}).toArray();
        
        // Count each city
        const cityCounts = {};
        allOutfits.forEach(outfit => {
            const city = outfit.city;
            cityCounts[city] = (cityCounts[city] || 0) + 1;
        });
        
        // Convert to array
        const cities = Object.keys(cityCounts).map(city => ({
            name: city,
            count: cityCounts[city],
            lastSearched: allOutfits.find(o => o.city === city)?.createdAt || new Date()
        }));
        
        // Sort by last searched
        cities.sort((a, b) => new Date(b.lastSearched) - new Date(a.lastSearched));
        
        res.render('history', { 
            cities: cities,
            totalSearches: allOutfits.length
        });
        
    } catch (error) {
        console.error('Error loading history:', error);
        res.render('history', { 
            cities: [],
            totalSearches: 0
        });
    }
});

// Delete ALL history
app.post('/delete-all-history', async (req, res) => {
    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        
        const result = await collection.deleteMany({});
        
        res.json({ 
            success: true, 
            message: `Deleted ${result.deletedCount} searches`
        });
    } catch (error) {
        console.error('Error deleting history:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete history' 
        });
    }
});





(async () => {
    try {
        await client.connect();

        app.listen(portNumber, () => {
            console.log(`Server running at http://localhost:${portNumber}`);
            process.stdout.write(`Stop to shut down the server: `);

            process.stdin.on('data', (data) => {
                const command = data.toString().trim();
                if (command === 'stop') {
                    process.exit(0);
                }
            });
        });
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
})();