#!/usr/bin/env python3
"""
Benchmark script to test performance improvements with Groq integration
"""

import requests
import time
import json

def test_video_processing(video_id, description=""):
    """Test video processing performance"""
    print(f"🎬 Testing: {description}")
    print(f"📺 Video ID: {video_id}")
    
    start_time = time.time()
    
    try:
        response = requests.get(f"http://localhost:8000/process_video?video_id={video_id}")
        
        if response.status_code == 200:
            data = response.json()
            total_time = time.time() - start_time
            
            print(f"✅ Success!")
            print(f"⚡ Total Request Time: {total_time:.2f}s")
            print(f"🧠 AI Processing Time: {data['processing_time']:.2f}s")
            print(f"📊 Total Duration: {data['total_duration']:.1f}s")
            print(f"✂️ Skip Percentage: {data['skip_percentage']:.1f}%")
            print(f"🎯 Segments to Skip: {len(data['remove'])}")
            
            # Show skip categories
            reasons = {}
            for segment in data['remove']:
                reason = segment.get('reason', 'Unknown')
                reasons[reason] = reasons.get(reason, 0) + 1
            
            if reasons:
                print("📋 Skip Categories:")
                for reason, count in reasons.items():
                    print(f"   • {reason}: {count}")
            
            return {
                'success': True,
                'total_time': total_time,
                'processing_time': data['processing_time'],
                'skip_percentage': data['skip_percentage'],
                'segments_count': len(data['remove'])
            }
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
            return {'success': False}
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {'success': False}

def main():
    print("🚀 YT_Skip Performance Benchmark")
    print("=" * 60)
    print("Testing Groq + Llama 4 Scout Integration")
    print("=" * 60)
    
    # Test cases with different video types
    test_cases = [
        ("dQw4w9WgXcQ", "Rick Astley - Never Gonna Give You Up (Music Video)"),
        ("9bZkp7q19f0", "PSY - GANGNAM STYLE (Music Video)"),
        ("jNQXAC9IVRw", "Me at the zoo (First YouTube Video)"),
    ]
    
    results = []
    
    for i, (video_id, description) in enumerate(test_cases, 1):
        print(f"\n📊 Test Case {i}/{len(test_cases)}")
        print("-" * 40)
        
        result = test_video_processing(video_id, description)
        if result['success']:
            results.append(result)
        
        print()
    
    if results:
        print("📈 PERFORMANCE SUMMARY")
        print("=" * 60)
        
        avg_total_time = sum(r['total_time'] for r in results) / len(results)
        avg_processing_time = sum(r['processing_time'] for r in results) / len(results)
        avg_skip_percentage = sum(r['skip_percentage'] for r in results) / len(results)
        total_segments = sum(r['segments_count'] for r in results)
        
        print(f"🎯 Tests Completed: {len(results)}")
        print(f"⚡ Average Total Time: {avg_total_time:.2f}s")
        print(f"🧠 Average AI Processing: {avg_processing_time:.2f}s")
        print(f"✂️ Average Skip Rate: {avg_skip_percentage:.1f}%")
        print(f"🎬 Total Skip Segments Found: {total_segments}")
        
        # Performance rating
        if avg_total_time < 2.0:
            rating = "🔥 BLAZING FAST"
        elif avg_total_time < 3.0:
            rating = "⚡ VERY FAST"
        elif avg_total_time < 5.0:
            rating = "✅ FAST"
        else:
            rating = "🐌 NEEDS OPTIMIZATION"
            
        print(f"🏆 Performance Rating: {rating}")
        
        print("\n🎉 Groq + Llama 4 Scout delivering ultra-fast inference!")
        
    # Test health and stats endpoints
    print("\n🔧 SYSTEM STATUS")
    print("=" * 60)
    
    try:
        health = requests.get("http://localhost:8000/health").json()
        stats = requests.get("http://localhost:8000/api/stats").json()
        
        print(f"🏥 Health Status: {health['status']}")
        print(f"💾 Cache Size: {health['cache_size']}")
        print(f"🤖 AI Model: {stats['model_info']['name']}")
        print(f"⚡ Provider: {stats['model_info']['provider']}")
        print(f"🧠 Context Window: {stats['model_info']['context_window']}")
        
    except Exception as e:
        print(f"❌ System check failed: {e}")

if __name__ == "__main__":
    main() 