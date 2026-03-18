const BASE_DOMAIN = "api2.hackclub.com";
let projects = [];
let currentSlides = {};

document.addEventListener('DOMContentLoaded', function() {
    getSubmissions();
});

async function getSubmissions() {
    try {
        document.getElementById('make-yours').style.display = 'none';
        const url = `https://api2.hackclub.com/v0.1/Pathfinder/YSWS%20Project%20Submission?select={%22filterByFormula%22:%20%22{Automation%20-%20YSWS%20Record%20ID}%20%22}&cache=true`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const submissions = await response.json();
        console.log('Received submissions:', submissions);

        projects = submissions.map((submission, index) => {
            const fields = submission.fields;
            const images = extractImages(fields);

            return {
                id: index + 1,
                title: fields["Project Name"] || "Untitled Project",
                description: fields["Description"] || "No description available",
                images: images,
                author: fields["GitHub Username"] || "Anonymous",
                country: fields["Country"] || "Unknown",
                githubUrl: fields["GitHub Username"] ? `https://github.com/${fields["GitHub Username"]}` : "#",
                featured: fields["Featured"] === true || false,
                //more fields
                projectUrl: fields["Code URL"] || null,
                submissionDate: fields["Created"] || null
            };
        });

        document.getElementById('loading').style.display = 'none';
        
        renderProjects();
        
        projects.forEach(project => {
            currentSlides[project.id] = 0;
        });

    } catch (error) {
        console.error('Error fetching submissions:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Error loading projects. Please try again later.';
    }
}

function renderProjects(projectsToRender = projects) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';

    if (projectsToRender.length === 0) {
        gallery.innerHTML = '<div style="text-align: center; color: #faffdc; font-size: 1.2rem;">No projects found.</div>';
        return;
    }

    projectsToRender.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        const carouselSlides = project.images.map((image, index) => `
            <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                <img src="${image}" alt="${project.title} - Image ${index + 1}" 
                     onerror="this.src='https://www.freeiconspng.com/uploads/wrench-png-2.png'">
            </div>
        `).join('');
        
        const carouselDots = project.images.length > 1 ? `
            <div class="carousel-nav">
                ${project.images.map((_, index) => `
                    <div class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="showSlide(${project.id}, ${index})"></div>
                `).join('')}
            </div>
        ` : '';
        
        const carouselArrows = project.images.length > 1 ? `
            <button class="carousel-arrow prev" onclick="prevSlide(${project.id})">‹</button>
            <button class="carousel-arrow next" onclick="nextSlide(${project.id})">›</button>
        ` : '';

        card.innerHTML = `
            <div class="card-image">
                ${project.featured ? '<div class="featured-badge">Featured</div>' : ''}
                <div class="carousel-container" data-project-id="${project.id}">
                    ${carouselSlides}
                    ${carouselArrows}
                    ${carouselDots}
                </div>
            </div>
            <div class="card-content">
                <h3 class="card-title">${project.title}</h3>
                <p class="card-description">${project.description}</p>
                <p class="card-author">- made by ${project.author} from ${project.country}</p>
                <div class="card-actions">
                    <a href="${project.projectUrl}" target="_blank" class="github-button">
                        GitHub Repo
                    </a>
                </div>
            </div>
        `;
        gallery.appendChild(card);
        document.getElementById('make-yours').style.display = 'block';
    });
}

function showSlide(projectId, slideIndex) {
    const carousel = document.querySelector(`[data-project-id="${projectId}"]`);
    if (!carousel) return;
    
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));
    
    if (slides[slideIndex]) {
        slides[slideIndex].classList.add('active');
    }
    if (dots[slideIndex]) {
        dots[slideIndex].classList.add('active');
    }
    
    currentSlides[projectId] = slideIndex;
}

function nextSlide(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const currentIndex = currentSlides[projectId] || 0;
    const nextIndex = (currentIndex + 1) % project.images.length;
    showSlide(projectId, nextIndex);
}

function prevSlide(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const currentIndex = currentSlides[projectId] || 0;
    const prevIndex = (currentIndex - 1 + project.images.length) % project.images.length;
    showSlide(projectId, prevIndex);
}

const extractImages = (fields) => {
    const images = [];
    
    const imageFields = [
        'Screenshot',
        'Schematic Screenshot',
        'PCB Back Screenshot'
    ];
    
    imageFields.forEach(fieldName => {
        const fieldData = fields[fieldName];
        if (fieldData && Array.isArray(fieldData) && fieldData.length > 0) {
            fieldData.forEach(img => {
                if (img && img.url) {
                    images.push(img.url);
                }
            });
        }
    });
    
    if (images.length === 0) {
        images.push("https://hc-cdn.hel1.your-objectstorage.com/s/v3/ee0109f20430335ebb5cd3297a973ce244ed01cf_depositphotos_247872612-stock-illustration-no-image-available-icon-vector.jpg");
    }
    
    return images;
};