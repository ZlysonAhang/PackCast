const express = require('express');


module.exports = function(Suggestion, getOpenWeatherData, getOutfitForToday) {
    const router = express.Router();


    router.get('/', (req, res) => {
        res.render('index', { 
            todayDate: new Date().toISOString().split('T')[0] 
        });
    });


    router.post('/getOutfit', async (req, res) => {
        const { city } = req.body; 
        
        try {
            console.log('Getting outfit for:', city);

            // Get TODAY's weather
            const weatherData = await getOpenWeatherData(city);

            if (!weatherData.success) {
                return res.render('index', {
                    todayDate: new Date().toISOString().split('T')[0],
                    error: weatherData.message
                });
            }

            
            const outfitAdvice = getOutfitForToday(weatherData.data);
            
            try {
                const newSuggestion = new Suggestion({
                    city: city,
                    weather: weatherData.data,
                    outfit: outfitAdvice,
                    createdAt: new Date()
                });
                
                await newSuggestion.save();
                console.log('SUCCESS: Saved to MongoDB via Mongoose');
            } catch (dbError) {
                console.log('Error saving to database:', dbError);
                return res.status(500).send('Error saving to database');
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
            res.status(500).send('Error processing request');
        }
    });

    // History route - GET /history
    router.get('/history', async (req, res) => {
        try {
            const allOutfits = await Suggestion.find({}).sort({ createdAt: -1 });
            
            const timesSearched = {};
            allOutfits.forEach(outfit => {
                const city = outfit.city;
                timesSearched[city] = (timesSearched[city] || 0) + 1;
            });
            
          
            const cities = Object.keys(timesSearched).map(city => ({
                name: city,
                count: timesSearched[city],
                lastSearched: allOutfits.find(o => o.city === city)?.createdAt || new Date()
            }));
            
            // Sort by last searched (newest -> oldest)
            cities.sort((a, b) => new Date(b.lastSearched) - new Date(a.lastSearched));
            
            res.render('history', { 
                cities: cities,
                totalSearches: allOutfits.length
            });
            
        } catch (error) {
            console.error('Error loading history:', error);
            res.status(500).send('Error loading history');
        }
    });

    
    router.post('/delete-all', async (req, res) => {
        try {
            const result = await Suggestion.deleteMany({});
            
            res.json({ 
                success: true, 
                message: `Deleted ${result.deletedCount} searches`
            });
        } catch (error) {
            console.error('Error deleting history:', error);
            res.status(500).json({ success: false, message: 'Error deleting history' });
        }
    });

    return router;
};