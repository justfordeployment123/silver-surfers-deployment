import path from 'path';
import fs from 'fs';
import { createAllHighlightedImages } from './draw_all.js';

async function testCreateAllImages() {
    // Test configuration
    const jsonFilePath = 'F:/third_try/my-app/services/load_and_audit/report-curemd-com-1757764239485.json';
    const outputFolder = './test-images-output';
    
    console.log('=== Testing createAllHighlightedImages Function ===');
    console.log(`Input JSON: ${jsonFilePath}`);
    console.log(`Output folder: ${outputFolder}`);
    
    // Create output folder if it doesn't exist
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
        console.log(`Created output folder: ${outputFolder}`);
    }
    
    try {
        console.log('\nStarting image generation process...');
        
        const imagePaths = await createAllHighlightedImages(jsonFilePath, outputFolder);
        
        console.log('\n=== Image Generation Complete ===');
        console.log('Generated image paths:');
        
        Object.entries(imagePaths).forEach(([auditId, imagePath]) => {
            const exists = fs.existsSync(imagePath);
            const status = exists ? 'EXISTS' : 'MISSING';
            console.log(`  ${auditId}: ${imagePath} ${status}`);
        });
        
        // Verify all expected images were created
        const expectedAudits = [
            'layout-brittle-audit',
            'interactive-color-audit', 
            'color-contrast',
            'target-size',
            'text-font-audit'
        ];
        
        console.log('\n=== Verification ===');
        let allSuccessful = true;
        
        expectedAudits.forEach(auditId => {
            if (imagePaths[auditId] && fs.existsSync(imagePaths[auditId])) {
                console.log(`${auditId}: SUCCESS`);
            } else {
                console.log(`${auditId}: FAILED`);
                allSuccessful = false;
            }
        });
        
        if (allSuccessful) {
            console.log('\nALL IMAGES GENERATED SUCCESSFULLY!');
            
            // Show folder contents
            console.log('\n=== Output Folder Contents ===');
            const files = fs.readdirSync(outputFolder);
            files.forEach(file => {
                const filePath = path.join(outputFolder, file);
                const stats = fs.statSync(filePath);
                console.log(`  ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
            });
            
            console.log('\n=== Return Value for Server Use ===');
            console.log('The function returned this imagePaths object:');
            console.log(JSON.stringify(imagePaths, null, 2));
            
        } else {
            console.log('\nSome images failed to generate. Check the individual processors.');
        }
        
    } catch (error) {
        console.error('\nERROR during image generation:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testCreateAllImages();